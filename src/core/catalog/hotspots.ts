/**
 * High-edge file suggestions for the map catalog.
 * Ranked by unique runtime file neighbors (in + out); edge-record degrees dual-published.
 * Sort key is rankScore (unique/package runtime score after barrel demotion).
 */

import {
	HOTSPOT_SURFACE_DEMOTION,
	inferFileRoles,
	isHotspotDemotedSurface,
} from '@core/catalog/roles.ts';
import type { CatalogHotspot, CodeGraph } from '@core/graph/types.ts';
import { fileDegreeMaps } from '@core/view/fileImporters.ts';

export type CatalogHotspotsOpts = {
	/** Paths treated as entrypoints (from starts entrypoint set). */
	entrypointSet?: ReadonlySet<string>;
};

/**
 * Source files with the highest unique-neighbor import activity.
 * edgeCount = uniqueOut + uniqueIn (runtime) or runtime packageOut for package-only.
 * rankScore = edgeCount after barrel demotion (list sort key).
 * Pure type-only sinks (no runtime file neighbors, no runtime package outs) are dropped.
 */
export function catalogHotspots(
	graph: CodeGraph,
	limit = 15,
	opts?: CatalogHotspotsOpts,
): CatalogHotspot[] {
	// Edge-record degrees (all edges) for dual publish of traffic badges
	const all = fileDegreeMaps(graph, { runtimeOnly: false });
	// Ranking uses runtime-preferring unique neighbors / package outs
	const runtime = fileDegreeMaps(graph, { runtimeOnly: true });
	const entrypointSet = opts?.entrypointSet;

	const hotspots: CatalogHotspot[] = [];

	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const uniqueOut = runtime.uniqueOut.get(path) ?? 0;
		const uniqueIn = runtime.uniqueIn.get(path) ?? 0;
		const uniqueScore = uniqueOut + uniqueIn;
		const runtimePackageOut = runtime.packageOut.get(path) ?? 0;

		// Skip pure type-only / idle files: no runtime file neighbors and no
		// runtime package/unresolved outs. Do not fall back to all edge records
		// (that reintroduces type-only traffic into ranking).
		if (uniqueScore === 0 && runtimePackageOut === 0) continue;

		const out = all.outDeg.get(path) ?? 0;
		const inn = all.inDeg.get(path) ?? 0;
		// Package-only hubs: score by runtime package outs (not type-only file traffic)
		const baseScore = uniqueScore > 0 ? uniqueScore : runtimePackageOut;
		// Barrel / façade demotion (single factor; do not stack)
		const demote = isHotspotDemotedSurface(graph, path);
		const rankScore = demote ? baseScore * HOTSPOT_SURFACE_DEMOTION : baseScore;
		const roles = inferFileRoles(graph, path, { entrypointSet });

		hotspots.push({
			id: path,
			path,
			edgeCount: baseScore,
			rankScore,
			outDegree: out,
			inDegree: inn,
			uniqueOut,
			uniqueIn,
			packageOut: all.packageOut.get(path) ?? 0,
			roles,
			epistemic: 'observed',
		});
	}

	hotspots.sort(
		(a, b) =>
			(b.rankScore ?? b.edgeCount) - (a.rankScore ?? a.edgeCount) ||
			b.edgeCount - a.edgeCount ||
			b.outDegree - a.outDegree ||
			a.path.localeCompare(b.path),
	);
	return hotspots.slice(0, limit);
}
