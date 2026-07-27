/**
 * High-edge file suggestions for the map catalog.
 * Ranked by unique runtime file neighbors (in + out); edge-record degrees dual-published.
 */

import { isPureBarrel, inferFileRoles } from '@core/catalog/roles.ts';
import type { CatalogHotspot, CodeGraph } from '@core/graph/types.ts';
import { fileDegreeMaps } from '@core/view/fileImporters.ts';

/**
 * Source files with the highest unique-neighbor import activity.
 * edgeCount = uniqueOut + uniqueIn (runtime edges when typeOnly present).
 * Pure barrels are demoted in ranking (score × 0.35) but still listable.
 */
export function catalogHotspots(graph: CodeGraph, limit = 15): CatalogHotspot[] {
	// Edge-record degrees (all edges) for dual publish
	const all = fileDegreeMaps(graph, { runtimeOnly: false });
	// Ranking uses runtime-preferring unique neighbors
	const runtime = fileDegreeMaps(graph, { runtimeOnly: true });

	type Row = CatalogHotspot & { rankScore: number };
	const hotspots: Row[] = [];

	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const uniqueOut = runtime.uniqueOut.get(path) ?? 0;
		const uniqueIn = runtime.uniqueIn.get(path) ?? 0;
		const edgeCount = uniqueOut + uniqueIn;
		if (edgeCount === 0) {
			// Still surface files with only package outs via edge records
			const out = all.outDeg.get(path) ?? 0;
			const inn = all.inDeg.get(path) ?? 0;
			if (out + inn === 0) continue;
		}
		const out = all.outDeg.get(path) ?? 0;
		const inn = all.inDeg.get(path) ?? 0;
		const uniqueScore =
			(runtime.uniqueOut.get(path) ?? 0) + (runtime.uniqueIn.get(path) ?? 0);
		// Fallback to edge records when no unique file neighbors (package-only hubs)
		const baseScore = uniqueScore > 0 ? uniqueScore : out + inn;
		const barrel = isPureBarrel(graph, path);
		const rankScore = barrel ? baseScore * 0.35 : baseScore;
		const roles = inferFileRoles(graph, path);

		hotspots.push({
			id: path,
			path,
			edgeCount: uniqueScore > 0 ? uniqueScore : out + inn,
			outDegree: out,
			inDegree: inn,
			uniqueOut: runtime.uniqueOut.get(path) ?? 0,
			uniqueIn: runtime.uniqueIn.get(path) ?? 0,
			packageOut: all.packageOut.get(path) ?? 0,
			roles,
			epistemic: 'observed',
			rankScore,
		});
	}

	hotspots.sort(
		(a, b) =>
			b.rankScore - a.rankScore ||
			b.edgeCount - a.edgeCount ||
			b.outDegree - a.outDegree ||
			a.path.localeCompare(b.path),
	);
	return hotspots.slice(0, limit).map(({ rankScore: _r, ...row }) => row);
}
