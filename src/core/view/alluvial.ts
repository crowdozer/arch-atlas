/**
 * Project CodeGraph + start → Carbon Charts alluvial payload.
 * Columns: Start → Module groups → Packages/ends
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

	// module cluster counts: files (except start) reached
	const moduleCounts = new Map<string, number>();
	for (const path of reachable) {
		if (path === startId) continue;
		const folder = topFolder(path);
		moduleCounts.set(folder, (moduleCounts.get(folder) ?? 0) + 1);
	}

	// package/end edges from reachable files
	const endCounts = new Map<string, { label: string; kind: string; value: number }>();
	for (const e of graph.edges) {
		if (!reachable.has(e.from)) continue;
		if (e.toKind === 'file') continue;
		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const key = e.to;
		const cur = endCounts.get(key) ?? { label, kind: e.toKind, value: 0 };
		cur.value += 1;
		endCounts.set(key, cur);
	}

	// if no intermediate modules, synthesize a single "modules" hop from start self-weight
	const moduleEntries = [...moduleCounts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxModules);

	const endEntries = [...endCounts.entries()]
		.sort((a, b) => b[1].value - a[1].value || a[1].label.localeCompare(b[1].label))
		.slice(0, maxEnds);

	// overflow buckets
	const moduleRest = [...moduleCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(maxModules)
		.reduce((s, [, n]) => s + n, 0);
	if (moduleRest > 0) moduleEntries.push(['(other modules)', moduleRest]);

	const endRest = [...endCounts.entries()]
		.sort((a, b) => b[1].value - a[1].value)
		.slice(maxEnds)
		.reduce((s, [, v]) => s + v.value, 0);
	if (endRest > 0) {
		endEntries.push(['(other ends)', { label: '(other ends)', kind: 'package', value: endRest }]);
	}

	const links: { source: string; target: string; value: number }[] = [];

	// Start → modules
	if (moduleEntries.length === 0) {
		// still show start → packages if any
		if (endEntries.length === 0) {
			// trivial self
			links.push({ source: startLabel, target: '(no imports)', value: 1 });
		} else {
			for (const [, info] of endEntries) {
				links.push({
					source: startLabel,
					target: info.label,
					value: Math.max(1, info.value),
				});
			}
		}
	} else {
		const moduleTotal = moduleEntries.reduce((s, [, n]) => s + n, 0) || 1;
		for (const [folder, count] of moduleEntries) {
			links.push({
				source: startLabel,
				target: folder,
				value: Math.max(1, count),
			});
		}
		// modules → ends proportional
		if (endEntries.length) {
			const endTotal = endEntries.reduce((s, [, v]) => s + v.value, 0) || 1;
			for (const [folder, count] of moduleEntries) {
				const folderShare = count / moduleTotal;
				for (const [, info] of endEntries) {
					const v = Math.max(
						1,
						Math.round((info.value / endTotal) * folderShare * endTotal),
					);
					// keep smaller graph: only connect top modules to ends via proportional
					links.push({
						source: folder,
						target: info.label,
						value: v,
					});
				}
			}
			// Cap link explosion: if too many, reduce to module→aggregate ends only from top 3 modules
			if (links.length > 80) {
				const keepModules = new Set(moduleEntries.slice(0, 3).map(([k]) => k));
				const filtered = links.filter(
					(l) => l.source === startLabel || keepModules.has(l.source),
				);
				links.length = 0;
				links.push(...filtered);
			}
		}
	}

	// unique nodes with categories
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(startLabel, { category: 'Start', color: TEAL.start });

	for (const [folder] of moduleEntries) {
		nodeMeta.set(folder, {
			category: 'Modules',
			color: folder.startsWith('(') ? TEAL.other : TEAL.module,
		});
	}
	for (const [, info] of endEntries) {
		const color =
			info.kind === 'unresolved'
				? TEAL.unresolved
				: info.kind === 'package' && graph.packages.get(info.label)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(info.label, { category: 'Ends', color });
	}
	if (links.some((l) => l.target === '(no imports)')) {
		nodeMeta.set('(no imports)', { category: 'Ends', color: TEAL.other });
	}

	// ranks: start col, modules, ends
	const starts = [startLabel];
	const mods = [...nodeMeta.entries()]
		.filter(([, m]) => m.category === 'Modules')
		.map(([n]) => n)
		.sort();
	const ends = [...nodeMeta.entries()]
		.filter(([, m]) => m.category === 'Ends')
		.map(([n]) => n)
		.sort();

	const nodes: AlluvialPayload['options']['alluvial']['nodes'] = [];
	const nodeRank: Record<string, number> = {};
	let rank = 0;
	for (const n of starts) {
		nodes.push({ name: n, category: 'Start', rank });
		nodeRank[n] = rank++;
	}
	rank = 0;
	for (const n of mods) {
		nodes.push({ name: n, category: 'Modules', rank });
		nodeRank[n] = rank++;
	}
	rank = 0;
	for (const n of ends) {
		nodes.push({ name: n, category: 'Ends', rank });
		nodeRank[n] = rank++;
	}

	const colorScale: Record<string, string> = {};
	for (const [name, meta] of nodeMeta) colorScale[name] = meta.color;

	// collapse duplicate links
	const linkMap = new Map<string, number>();
	for (const l of links) {
		const k = `${l.source}\0${l.target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + l.value);
	}
	const data = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	if (!data.length) return null;

	return {
		data,
		options: {
			title: '',
			theme: 'g100',
			height: `${heightPx}px`,
			animations: false,
			toolbar: { enabled: false },
			legend: { enabled: false, clickable: false },
			accessibility: {
				svgAriaLabel: `Import alluvial from ${startLabel}`,
			},
			alluvial: {
				units: 'imports',
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
