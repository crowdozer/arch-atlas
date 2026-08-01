/**
 * Pure CodeGraph ↔ JSON-transfer helpers for worker postMessage (and tests).
 * No TypeScript Program / createProgram - Maps become plain entries arrays.
 */

import type {
	CodeGraph,
	FileNode,
	ImportEdge,
	PackageNode,
	ParseMapEntry,
} from '@core/graph/types.ts';

/** Plain-object shape of {@link CodeGraph} safe for structured clone / JSON. */
export type SerializedCodeGraph = {
	files: [string, FileNode][];
	packages: [string, PackageNode][];
	edges: ImportEdge[];
	contents: [string, string][];
	packageJsonPaths: string[];
	parseMap: [string, ParseMapEntry][];
	stats: CodeGraph['stats'];
};

/**
 * Flatten Maps to arrays so the graph can cross a Worker boundary.
 * Edges and stats are already plain; contents may be large.
 */
export function serializeCodeGraph(graph: CodeGraph): SerializedCodeGraph {
	return {
		files: [...graph.files.entries()],
		packages: [...graph.packages.entries()],
		edges: graph.edges.map((e) => ({ ...e })),
		contents: [...graph.contents.entries()],
		packageJsonPaths: [...graph.packageJsonPaths],
		parseMap: [...graph.parseMap.entries()],
		stats: { ...graph.stats },
	};
}

/**
 * Rebuild Map-based {@link CodeGraph} from a serialized snapshot.
 * Throws if the payload is missing required fields (hard programmer error).
 */
export function deserializeCodeGraph(obj: SerializedCodeGraph): CodeGraph {
	if (!obj || typeof obj !== 'object') {
		throw new Error('deserializeCodeGraph: expected serialized graph object');
	}
	if (!Array.isArray(obj.files) || !Array.isArray(obj.edges)) {
		throw new Error('deserializeCodeGraph: files/edges must be arrays');
	}
	return {
		files: new Map(obj.files),
		packages: new Map(obj.packages ?? []),
		edges: obj.edges.map((e) => ({ ...e })),
		contents: new Map(obj.contents ?? []),
		packageJsonPaths: [...(obj.packageJsonPaths ?? [])],
		parseMap: new Map(obj.parseMap ?? []),
		stats: { ...obj.stats },
	};
}
