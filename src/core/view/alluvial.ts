/**
 * Project CodeGraph + start → Carbon Charts alluvial payload.
 * Columns (L→R): Packages/ends → Module groups → Code (start)
 *
 * Flow unit: one observed package/unresolved import edge in the reachable set.
 * Links are conserved: for each module, sum(in) === sum(out).
 * Direct package imports by the start go Ends → Code (skip modules).
 */

import { reachableFiles } from '@core/graph/build.ts';
import type { AlluvialPayload, CodeGraph } from '@core/graph/types.ts';

const TEAL = {
	start: '#14b8a6', // teal-500
	module: '#2dd4bf', // teal-400
	package: '#0d9488', // teal-600
	builtin: '#5eead4', // teal-300
	unresolved: '#f59e0b', // amber
	other: '#71717a', // zinc-500
};

function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i >= 0 ? path.slice(i + 1) : path;
}

function topFolder(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return '(root)';
	if (parts[0] === 'src' && parts.length > 2) return `src/${parts[1]}`;
	return parts[0] ?? '(root)';
}

type EndInfo = { label: string; kind: string };

/**
 * Build alluvial from a start file. Returns null if start missing or no flow.
 */
export function projectAlluvial(
	graph: CodeGraph,
	startId: string,
	opts?: { heightPx?: number; maxModules?: number; maxEnds?: number },
): AlluvialPayload | null {
	if (!graph.files.has(startId)) return null;

	const maxModules = opts?.maxModules ?? 12;
	const maxEnds = opts?.maxEnds ?? 16;
	const heightPx = opts?.heightPx ?? 360;

	const reachable = reachableFiles(graph, startId);
	const startLabel = basename(startId);

	// end → module (or '__code__' for direct start imports), counts
	const endToModule = new Map<string, Map<string, number>>();
	const endMeta = new Map<string, EndInfo>();

	const bump = (endKey: string, moduleKey: string, info: EndInfo) => {
		endMeta.set(endKey, info);
		let row = endToModule.get(endKey);
		if (!row) {
			row = new Map();
			endToModule.set(endKey, row);
		}
		row.set(moduleKey, (row.get(moduleKey) ?? 0) + 1);
	};

	for (const e of graph.edges) {
		if (!reachable.has(e.from)) continue;
		if (e.toKind === 'file') continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const endKey = e.to;
		const info: EndInfo = { label, kind: e.toKind };
		const moduleKey = e.from === startId ? '__code__' : topFolder(e.from);
		bump(endKey, moduleKey, info);
	}

	if (!endToModule.size) {
		// reachable files but no package edges — show a single placeholder hop
		return buildPayload({
			startId,
			startLabel,
			heightPx,
			links: [{ source: '(no package imports)', target: startLabel, value: 1 }],
			nodeMeta: new Map([
				[startLabel, { category: 'Code', color: TEAL.start }],
				['(no package imports)', { category: 'Ends', color: TEAL.other }],
			]),
		});
	}

	// Totals for ranking / overflow buckets
	const endTotals = new Map<string, number>();
	const moduleTotals = new Map<string, number>();

	for (const [endKey, row] of endToModule) {
		let endSum = 0;
		for (const [mod, n] of row) {
			endSum += n;
			if (mod !== '__code__') {
				moduleTotals.set(mod, (moduleTotals.get(mod) ?? 0) + n);
			}
		}
		endTotals.set(endKey, endSum);
	}

	const topModules = [...moduleTotals.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxModules)
		.map(([k]) => k);
	const keptModules = new Set(topModules);
	if ([...moduleTotals.keys()].some((k) => !keptModules.has(k))) {
		keptModules.add('(other modules)');
	}

	const topEnds = [...endTotals.entries()]
		.sort(
			(a, b) =>
				b[1] - a[1] ||
				(endMeta.get(a[0])?.label ?? '').localeCompare(endMeta.get(b[0])?.label ?? ''),
		)
		.slice(0, maxEnds)
		.map(([k]) => k);
	const keptEnds = new Set(topEnds);

	const remapModule = (mod: string): string => {
		if (mod === '__code__') return '__code__';
		return keptModules.has(mod) ? mod : '(other modules)';
	};

	// Conserved link multiset after bucketing
	const linkMap = new Map<string, number>();
	const addLink = (source: string, target: string, value: number) => {
		if (value <= 0) return;
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	for (const [endKey, row] of endToModule) {
		const sourceLabel = keptEnds.has(endKey)
			? (endMeta.get(endKey)?.label ?? endKey)
			: '(other ends)';

		for (const [mod, n] of row) {
			const m = remapModule(mod);
			if (m === '__code__') addLink(sourceLabel, startLabel, n);
			else addLink(sourceLabel, m, n);
		}
	}

	// Module → code: exactly the inflow to each module (conservation)
	const moduleIn = new Map<string, number>();
	for (const [k, value] of linkMap) {
		const target = k.split('\0')[1]!;
		if (target === startLabel) continue;
		moduleIn.set(target, (moduleIn.get(target) ?? 0) + value);
	}
	for (const [mod, n] of moduleIn) {
		addLink(mod, startLabel, n);
	}

	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(startLabel, { category: 'Code', color: TEAL.start });

	for (const [mod] of moduleIn) {
		nodeMeta.set(mod, {
			category: 'Modules',
			color: mod.startsWith('(') ? TEAL.other : TEAL.module,
		});
	}

	const endLabelsSeen = new Set<string>();
	for (const [k] of linkMap) {
		const source = k.split('\0')[0]!;
		if (source === startLabel || moduleIn.has(source)) continue;
		endLabelsSeen.add(source);
	}
	for (const label of endLabelsSeen) {
		let kind = 'package';
		if (!label.startsWith('(')) {
			for (const info of endMeta.values()) {
				if (info.label === label) {
					kind = info.kind;
					break;
				}
			}
		}
		const color =
			kind === 'unresolved'
				? TEAL.unresolved
				: kind === 'package' && graph.packages.get(label)?.source === 'builtin'
					? TEAL.builtin
					: label.startsWith('(')
						? TEAL.other
						: TEAL.package;
		nodeMeta.set(label, { category: 'Ends', color });
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildPayload({
		startId,
		startLabel,
		heightPx,
		links,
		nodeMeta,
	});
}

function buildPayload(args: {
	startId: string;
	startLabel: string;
	heightPx: number;
	links: { source: string; target: string; value: number }[];
	nodeMeta: Map<string, { category: string; color: string }>;
}): AlluvialPayload | null {
	const { startId, startLabel, heightPx, links, nodeMeta } = args;
	if (!links.length) return null;

	const ends = [...nodeMeta.entries()]
		.filter(([, m]) => m.category === 'Ends')
		.map(([n]) => n)
		.sort();
	const mods = [...nodeMeta.entries()]
		.filter(([, m]) => m.category === 'Modules')
		.map(([n]) => n)
		.sort();
	const codes = [...nodeMeta.entries()]
		.filter(([, m]) => m.category === 'Code')
		.map(([n]) => n);

	const nodes: AlluvialPayload['options']['alluvial']['nodes'] = [];
	const nodeRank: Record<string, number> = {};
	let rank = 0;
	for (const n of ends) {
		nodes.push({ name: n, category: 'Ends', rank });
		nodeRank[n] = rank++;
	}
	rank = 0;
	for (const n of mods) {
		nodes.push({ name: n, category: 'Modules', rank });
		nodeRank[n] = rank++;
	}
	rank = 0;
	for (const n of codes) {
		nodes.push({ name: n, category: 'Code', rank });
		nodeRank[n] = rank++;
	}

	const colorScale: Record<string, string> = {};
	for (const [name, meta] of nodeMeta) colorScale[name] = meta.color;

	return {
		data: links,
		options: {
			title: '',
			theme: 'g100',
			height: `${heightPx}px`,
			animations: false,
			toolbar: { enabled: false },
			legend: { enabled: false, clickable: false },
			accessibility: {
				svgAriaLabel: `Modules to code alluvial for ${startLabel}`,
			},
			alluvial: {
				units: 'package imports',
				nodes,
				nodeAlignment: 'center',
			},
			color: { scale: colorScale },
			tooltip: { enabled: true },
		},
		meta: {
			startId,
			nodeRank,
		},
	};
}
