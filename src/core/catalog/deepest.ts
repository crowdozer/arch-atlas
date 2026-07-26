/**
 * "Most hops" catalog bin: source files whose outbound import graph is deepest.
 * Hop = BFS distance over file→file import edges from the candidate start.
 */

import type { CatalogDeep, CodeGraph } from '@core/graph/types.ts';

/** Adjacency: file → imported files. */
export function fileImportAdj(graph: CodeGraph): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		const list = adj.get(e.from) ?? [];
		list.push(e.to);
		adj.set(e.from, list);
	}
	return adj;
}

/** Reverse adjacency: file → files that import it. */
export function fileImportedByAdj(graph: CodeGraph): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		const list = adj.get(e.to) ?? [];
		list.push(e.from);
		adj.set(e.to, list);
	}
	return adj;
}

/**
 * BFS distances from start along file imports (start = 0).
 */
export function fileDistances(
	graph: CodeGraph,
	startId: string,
	adj?: Map<string, string[]>,
): { dist: Map<string, number>; maxHops: number } {
	const a = adj ?? fileImportAdj(graph);
	const dist = new Map<string, number>();
	const q: string[] = [startId];
	dist.set(startId, 0);
	let maxHops = 0;

	while (q.length) {
		const cur = q.shift()!;
		const d = dist.get(cur) ?? 0;
		if (d > maxHops) maxHops = d;
		for (const n of a.get(cur) ?? []) {
			if (dist.has(n)) continue;
			dist.set(n, d + 1);
			q.push(n);
		}
	}
	return { dist, maxHops };
}

/**
 * BFS from start along file imports.
 * Returns max hop depth, reachable file count (incl. start), and distinct package ends.
 */
export function importDepthStats(
	graph: CodeGraph,
	startId: string,
	adj?: Map<string, string[]>,
): { maxHops: number; reachableFiles: number; packageEnds: number } {
	const { dist, maxHops } = fileDistances(graph, startId, adj);

	const packageEnds = new Set<string>();
	for (const e of graph.edges) {
		if (!dist.has(e.from)) continue;
		if (e.toKind === 'package' || e.toKind === 'unresolved') {
			packageEnds.add(e.to);
		}
	}

	return {
		maxHops,
		reachableFiles: dist.size,
		packageEnds: packageEnds.size,
	};
}

/**
 * Rank source files by deepest outbound import hop chain.
 * Skips leaves (maxHops === 0) — they belong in fan-in / high-edges, not depth.
 */
export function catalogDeepest(graph: CodeGraph, limit = 15): CatalogDeep[] {
	const adj = fileImportAdj(graph);
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}

	const deep: CatalogDeep[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const stats = importDepthStats(graph, path, adj);
		if (stats.maxHops < 1) continue;
		const out = outDeg.get(path) ?? 0;
		const inn = inDeg.get(path) ?? 0;
		deep.push({
			id: path,
			path,
			maxHops: stats.maxHops,
			reachableFiles: stats.reachableFiles,
			packageEnds: stats.packageEnds,
			edgeCount: out + inn,
			outDegree: out,
			inDegree: inn,
			epistemic: 'observed',
		});
	}

	deep.sort(
		(a, b) =>
			b.maxHops - a.maxHops ||
			b.reachableFiles - a.reachableFiles ||
			b.packageEnds - a.packageEnds ||
			a.path.localeCompare(b.path),
	);
	return deep.slice(0, limit);
}
