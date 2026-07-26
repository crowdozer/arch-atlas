/**
 * High-edge file suggestions for the map catalog.
 * Ranked by observed import edges involving each source file (in + out).
 */

import type { CatalogHotspot, CodeGraph } from '@core/graph/types.ts';

/**
 * Source files with the highest observed import edge activity.
 * edgeCount = outgoing edges + incoming file edges (packages count on the out side only).
 */
export function catalogHotspots(graph: CodeGraph, limit = 15): CatalogHotspot[] {
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	const packageOut = new Map<string, number>();

	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'package' || e.toKind === 'unresolved') {
			packageOut.set(e.from, (packageOut.get(e.from) ?? 0) + 1);
		}
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}

	const hotspots: CatalogHotspot[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const out = outDeg.get(path) ?? 0;
		const inn = inDeg.get(path) ?? 0;
		const edgeCount = out + inn;
		if (edgeCount === 0) continue;
		hotspots.push({
			id: path,
			path,
			edgeCount,
			outDegree: out,
			inDegree: inn,
			packageOut: packageOut.get(path) ?? 0,
			epistemic: 'observed',
		});
	}

	hotspots.sort(
		(a, b) =>
			b.edgeCount - a.edgeCount ||
			b.outDegree - a.outDegree ||
			a.path.localeCompare(b.path),
	);
	return hotspots.slice(0, limit);
}
