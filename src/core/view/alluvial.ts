/**
 * Project CodeGraph + start → Carbon Charts alluvial payload.
 * Columns (L→R): Packages/ends → Module groups → Code (start)
 *
 * Flow unit: one observed package/unresolved import edge in the reachable set.
 * Links are conserved: for each module, sum(in) === sum(out).
 * Direct package imports by the start go Ends → Code (skip modules).
 */

import { reachableFiles } from '@core/graph/build.ts';
import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
} from '@core/graph/types.ts';

export const TEAL = {
	start: '#14b8a6', // teal-500
	module: '#2dd4bf', // teal-400
	package: '#0d9488', // teal-600
	builtin: '#5eead4', // teal-300
	unresolved: '#f59e0b', // amber
	other: '#71717a', // zinc-500
};

export function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i >= 0 ? path.slice(i + 1) : path;
}

/** Top-level module folder for grouping (src/lib, app, …). */
export function topFolder(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return '(root)';
	if (parts[0] === 'src' && parts.length > 2) return `src/${parts[1]}`;
	return parts[0] ?? '(root)';
}

/** Collision-safe display labels for file paths (basename, or trailing segments). */
export function uniqueFileLabels(paths: string[]): Map<string, string> {
	const byBase = new Map<string, string[]>();
	for (const p of paths) {
		const b = basename(p);
		const list = byBase.get(b) ?? [];
		list.push(p);
		byBase.set(b, list);
	}
	const out = new Map<string, string>();
	for (const [base, group] of byBase) {
		if (group.length === 1) {
			out.set(group[0]!, base);
			continue;
		}
		for (const p of group) {
			const parts = p.split('/');
			out.set(p, parts.length >= 2 ? parts.slice(-2).join('/') : p);
		}
	}
	// Second pass if trailing-two still collides
	const labelCounts = new Map<string, number>();
	for (const label of out.values()) {
		labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
	}
	for (const [p, label] of out) {
		if ((labelCounts.get(label) ?? 0) > 1) out.set(p, p);
	}
	return out;
}

type EndInfo = { label: string; kind: string };

type NodeMetaEntry = { category: string; color: string };

/**
 * Shared Carbon alluvial payload builder.
 * `categoryOrder` lists columns L→R (e.g. Ends → Modules → Code).
 */
export function buildAlluvialPayload(args: {
	heightPx: number;
	links: { source: string; target: string; value: number }[];
	nodeMeta: Map<string, NodeMetaEntry>;
	categoryOrder: string[];
	focus: AlluvialFocus;
	nodeRef: Record<string, AlluvialNodeRef>;
	startId?: string;
	units?: string;
	ariaLabel?: string;
}): AlluvialPayload | null {
	const {
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId,
		units = 'package imports',
		ariaLabel,
	} = args;
	if (!links.length) return null;

	const nodes: AlluvialPayload['options']['alluvial']['nodes'] = [];
	const nodeRank: Record<string, number> = {};

	for (const category of categoryOrder) {
		const names = [...nodeMeta.entries()]
			.filter(([, m]) => m.category === category)
			.map(([n]) => n)
			.sort();
		let rank = 0;
		for (const n of names) {
			nodes.push({ name: n, category, rank });
			nodeRank[n] = rank++;
		}
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
				svgAriaLabel:
					ariaLabel ?? `Alluvial for ${focus.label}`,
			},
			alluvial: {
				units,
				nodes,
				nodeAlignment: 'center',
			},
			color: { scale: colorScale },
			tooltip: { enabled: true },
		},
		meta: {
			...(startId !== undefined ? { startId } : {}),
			focus,
			nodeRef,
			nodeRank,
		},
	};
}

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
	const focus: AlluvialFocus = {
		kind: 'file',
		id: startId,
		label: startLabel,
	};

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

	const nodeRef: Record<string, AlluvialNodeRef> = {
		[startLabel]: { kind: 'file', id: startId },
	};

	if (!endToModule.size) {
		const emptyLabel = '(no package imports)';
		nodeRef[emptyLabel] = { kind: 'bucket', id: emptyLabel };
		return buildAlluvialPayload({
			heightPx,
			links: [{ source: emptyLabel, target: startLabel, value: 1 }],
			nodeMeta: new Map([
				[startLabel, { category: 'Code', color: TEAL.start }],
				[emptyLabel, { category: 'Ends', color: TEAL.other }],
			]),
			categoryOrder: ['Ends', 'Modules', 'Code'],
			focus,
			nodeRef,
			startId,
			ariaLabel: `Modules to code alluvial for ${startLabel}`,
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

	// endKey → display label after bucketing (for nodeRef)
	const endDisplayId = new Map<string, string>();

	for (const [endKey, row] of endToModule) {
		const sourceLabel = keptEnds.has(endKey)
			? (endMeta.get(endKey)?.label ?? endKey)
			: '(other ends)';
		if (keptEnds.has(endKey)) endDisplayId.set(sourceLabel, endKey);

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

	const nodeMeta = new Map<string, NodeMetaEntry>();
	nodeMeta.set(startLabel, { category: 'Code', color: TEAL.start });

	for (const [mod] of moduleIn) {
		nodeMeta.set(mod, {
			category: 'Modules',
			color: mod.startsWith('(') ? TEAL.other : TEAL.module,
		});
		if (mod.startsWith('(')) {
			nodeRef[mod] = { kind: 'bucket', id: mod };
		} else {
			nodeRef[mod] = { kind: 'module', id: mod };
		}
	}

	const endLabelsSeen = new Set<string>();
	for (const [k] of linkMap) {
		const source = k.split('\0')[0]!;
		if (source === startLabel || moduleIn.has(source)) continue;
		endLabelsSeen.add(source);
	}
	for (const label of endLabelsSeen) {
		if (label.startsWith('(')) {
			nodeMeta.set(label, { category: 'Ends', color: TEAL.other });
			nodeRef[label] = { kind: 'bucket', id: label };
			continue;
		}
		let kind = 'package';
		let endKey = endDisplayId.get(label) ?? label;
		for (const [ek, info] of endMeta) {
			if (info.label === label) {
				kind = info.kind;
				endKey = ek;
				break;
			}
		}
		const color =
			kind === 'unresolved'
				? TEAL.unresolved
				: kind === 'package' && graph.packages.get(endKey)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(label, { category: 'Ends', color });
		nodeRef[label] = {
			kind: kind === 'unresolved' ? 'unresolved' : 'package',
			id: endKey,
		};
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['Ends', 'Modules', 'Code'],
		focus,
		nodeRef,
		startId,
		ariaLabel: `Modules to code alluvial for ${startLabel}`,
	});
}
