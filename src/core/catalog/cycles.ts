/**
 * Strongly connected components (SCC) on file→file import edges.
 * Runtime partition: !typeOnly edges. Type partition: typeOnly edges only.
 * Pure Tarjan; size ≥ 2 only in catalog rows.
 */

import type { CatalogScc, CodeGraph, ImportEdge } from '@core/graph/types.ts';

const SAMPLE_PATHS_CAP = 8;

export type CatalogCyclesResult = {
	runtime: CatalogScc[];
	type: CatalogScc[];
};

function buildAdj(
	edges: readonly ImportEdge[],
	pred: (e: ImportEdge) => boolean,
): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		if (e.toKind !== 'file') continue;
		if (!pred(e)) continue;
		const list = adj.get(e.from) ?? [];
		list.push(e.to);
		adj.set(e.from, list);
		// Ensure targets appear as nodes even with no out-edges
		if (!adj.has(e.to)) adj.set(e.to, adj.get(e.to) ?? []);
	}
	return adj;
}

/**
 * Tarjan SCC. Returns components with size ≥ 2 (cycles / mutual reachability).
 */
export function stronglyConnectedComponents(
	adj: Map<string, string[]>,
): string[][] {
	let index = 0;
	const indices = new Map<string, number>();
	const lowlink = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const components: string[][] = [];

	function strongConnect(v: string): void {
		indices.set(v, index);
		lowlink.set(v, index);
		index += 1;
		stack.push(v);
		onStack.add(v);

		for (const w of adj.get(v) ?? []) {
			if (!indices.has(w)) {
				strongConnect(w);
				lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
			} else if (onStack.has(w)) {
				lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
			}
		}

		if (lowlink.get(v) === indices.get(v)) {
			const comp: string[] = [];
			for (;;) {
				const w = stack.pop()!;
				onStack.delete(w);
				comp.push(w);
				if (w === v) break;
			}
			if (comp.length >= 2) {
				comp.sort((a, b) => a.localeCompare(b));
				components.push(comp);
			}
		}
	}

	for (const v of adj.keys()) {
		if (!indices.has(v)) strongConnect(v);
	}

	return components;
}

function edgeCountInComponent(
	edges: readonly ImportEdge[],
	members: ReadonlySet<string>,
	pred: (e: ImportEdge) => boolean,
): number {
	let n = 0;
	for (const e of edges) {
		if (e.toKind !== 'file') continue;
		if (!pred(e)) continue;
		if (members.has(e.from) && members.has(e.to)) n += 1;
	}
	return n;
}

function rowsForPartition(
	edges: readonly ImportEdge[],
	pred: (e: ImportEdge) => boolean,
	limit: number,
): CatalogScc[] {
	const adj = buildAdj(edges, pred);
	const comps = stronglyConnectedComponents(adj);
	const rows: CatalogScc[] = comps.map((paths) => {
		const set = new Set(paths);
		return {
			size: paths.length,
			samplePaths: paths.slice(0, SAMPLE_PATHS_CAP),
			edgeCount: edgeCountInComponent(edges, set, pred),
			epistemic: 'observed' as const,
		};
	});
	rows.sort(
		(a, b) =>
			b.size - a.size ||
			b.edgeCount - a.edgeCount ||
			(a.samplePaths[0] ?? '').localeCompare(b.samplePaths[0] ?? ''),
	);
	return rows.slice(0, Math.max(0, limit));
}

/**
 * Top SCCs by size for runtime (!typeOnly) and type (typeOnly) file graphs.
 */
export function catalogCycles(graph: CodeGraph, limit = 15): CatalogCyclesResult {
	const edges = graph.edges;
	return {
		runtime: rowsForPartition(edges, (e) => !e.typeOnly, limit),
		type: rowsForPartition(edges, (e) => Boolean(e.typeOnly), limit),
	};
}
