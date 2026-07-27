/**
 * Tree-depth and tree-complexity catalog bins over outbound import graphs.
 * - Depth: max BFS hops file→file
 * - Complexity: distinct downwind package/unresolved ends
 */

import type { CatalogComplex, CatalogDeep, CodeGraph } from '@core/graph/types.ts';

export type FileAdjOpts = {
	/** Skip typeOnly edges when true (ranking prefer runtime). */
	runtimeOnly?: boolean;
};

/** Adjacency: file → imported files. */
export function fileImportAdj(
	graph: CodeGraph,
	opts?: FileAdjOpts,
): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		if (opts?.runtimeOnly && e.typeOnly) continue;
		const list = adj.get(e.from) ?? [];
		list.push(e.to);
		adj.set(e.from, list);
	}
	return adj;
}

/** Reverse adjacency: file → files that import it. */
export function fileImportedByAdj(
	graph: CodeGraph,
	opts?: FileAdjOpts,
): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		if (opts?.runtimeOnly && e.typeOnly) continue;
		const list = adj.get(e.to) ?? [];
		list.push(e.from);
		adj.set(e.to, list);
	}
	return adj;
}

/**
 * Shortest-path BFS distances from start along file imports (start = 0).
 * First visit wins — good for reverse “who imports me” radius.
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
 * Longest simple-path distances from start along file imports (start = 0).
 * Cycle-safe (skips back-edges on the active stack). Used for **export** hub
 * columns so chains like focus→format→types stay expanded even when types is
 * also a direct dependency of focus (shortest-path would collapse types to 1).
 */
export function fileLongestDistances(
	graph: CodeGraph,
	startId: string,
	adj?: Map<string, string[]>,
): { dist: Map<string, number>; maxHops: number } {
	const a = adj ?? fileImportAdj(graph);
	const dist = new Map<string, number>();
	dist.set(startId, 0);

	const dfs = (cur: string, stack: Set<string>) => {
		const d = dist.get(cur) ?? 0;
		for (const n of a.get(cur) ?? []) {
			if (stack.has(n)) continue; // cycle
			const nd = d + 1;
			const prev = dist.get(n);
			if (prev !== undefined && nd <= prev) continue;
			dist.set(n, nd);
			stack.add(n);
			dfs(n, stack);
			stack.delete(n);
		}
	};

	const stack = new Set<string>([startId]);
	dfs(startId, stack);

	let maxHops = 0;
	for (const d of dist.values()) {
		if (d > maxHops) maxHops = d;
	}
	return { dist, maxHops };
}

/**
 * BFS from start along file imports.
 * Returns depth stats plus downwind edge mass (all edges whose from is reachable).
 */
export function importDepthStats(
	graph: CodeGraph,
	startId: string,
	adj?: Map<string, string[]>,
	opts?: FileAdjOpts,
): {
	maxHops: number;
	reachableFiles: number;
	packageEnds: number;
	/** File→file + file→package edges with from in the outbound reachable set. */
	downwindEdges: number;
} {
	const { dist, maxHops } = fileDistances(graph, startId, adj);

	const packageEnds = new Set<string>();
	let downwindEdges = 0;
	for (const e of graph.edges) {
		if (!dist.has(e.from)) continue;
		if (opts?.runtimeOnly && e.typeOnly) continue;
		downwindEdges += 1;
		if (e.toKind === 'package' || e.toKind === 'unresolved') {
			packageEnds.add(e.to);
		}
	}

	return {
		maxHops,
		reachableFiles: dist.size,
		packageEnds: packageEnds.size,
		downwindEdges,
	};
}

function degreeMaps(graph: CodeGraph): {
	outDeg: Map<string, number>;
	inDeg: Map<string, number>;
} {
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}
	return { outDeg, inDeg };
}

const COMPLEX_REASON = 'downwind import reach';

/**
 * Tree depth: deepest outbound import hop chain (max BFS hops).
 * Skips pure leaves (maxHops === 0).
 */
export function catalogDeepest(graph: CodeGraph, limit = 15): CatalogDeep[] {
	const adj = fileImportAdj(graph);
	const { outDeg, inDeg } = degreeMaps(graph);

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

/**
 * Tree complexity: downwind edge mass (file + package imports in the
 * outbound reachable set). start→page→pkg contributes 2, not 1.
 * Ranking prefers runtime edges when typeOnly flags present.
 * Tie-break: packageEnds, reachableFiles, maxHops.
 * Skips starts with no downwind edges.
 */
export function catalogComplex(graph: CodeGraph, limit = 15): CatalogComplex[] {
	const adj = fileImportAdj(graph, { runtimeOnly: true });
	const { outDeg, inDeg } = degreeMaps(graph);

	const complex: CatalogComplex[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const stats = importDepthStats(graph, path, adj, { runtimeOnly: true });
		if (stats.downwindEdges < 1) continue;
		const out = outDeg.get(path) ?? 0;
		const inn = inDeg.get(path) ?? 0;
		complex.push({
			id: path,
			path,
			downwindEdges: stats.downwindEdges,
			packageEnds: stats.packageEnds,
			reachableFiles: stats.reachableFiles,
			maxHops: stats.maxHops,
			edgeCount: out + inn,
			outDegree: out,
			inDegree: inn,
			reason: COMPLEX_REASON,
			epistemic: 'observed',
		});
	}

	complex.sort(
		(a, b) =>
			b.downwindEdges - a.downwindEdges ||
			b.packageEnds - a.packageEnds ||
			b.reachableFiles - a.reachableFiles ||
			b.maxHops - a.maxHops ||
			a.path.localeCompare(b.path),
	);
	return complex.slice(0, limit);
}
