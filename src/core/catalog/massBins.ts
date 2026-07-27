/**
 * Public-mass and iceberg catalog bins from whole-file LOC + Exact export-surface LOC.
 * Pure overlay: does not re-index the graph. Empty until a surface map is supplied.
 */

import type {
	CatalogIceberg,
	CatalogPublicMass,
	CodeGraph,
} from '@core/graph/types.ts';
import { fileLineCount } from '@core/view/weight.ts';

/** Minimum whole-file LOC to consider for mass bins (bookkeeping floor). */
export const MIN_WHOLE = 80;
/** Public mass: surface / whole must be at least this. */
export const PUBLIC_MIN_RATIO = 0.9;
/** Iceberg: surface / whole at most this (soft upper; sort by private mass). */
export const ICEBERG_MAX_RATIO = 0.7;
/** Iceberg: minimum private lines (whole − surface). */
export const MIN_PRIVATE = 40;

export type MassBinDefaults = {
	minWhole?: number;
	publicMinRatio?: number;
	icebergMaxRatio?: number;
	minPrivate?: number;
};

export type MassBinsResult = {
	publicMass: CatalogPublicMass[];
	icebergs: CatalogIceberg[];
};

/**
 * Build public-mass and iceberg rankings from graph + export-surface LOC map.
 * Degrees are for list badges only.
 */
export function buildMassBins(
	graph: CodeGraph,
	exportSurfaceLoc: ReadonlyMap<string, number>,
	limit = 15,
	defaults?: MassBinDefaults,
): MassBinsResult {
	const minWhole = defaults?.minWhole ?? MIN_WHOLE;
	const publicMinRatio = defaults?.publicMinRatio ?? PUBLIC_MIN_RATIO;
	const icebergMaxRatio = defaults?.icebergMaxRatio ?? ICEBERG_MAX_RATIO;
	const minPrivate = defaults?.minPrivate ?? MIN_PRIVATE;

	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}

	const publicMass: CatalogPublicMass[] = [];
	const icebergs: CatalogIceberg[] = [];

	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const wholeLoc = fileLineCount(graph, path);
		if (wholeLoc < minWhole) continue;

		const surfaceLoc = exportSurfaceLoc.get(path) ?? 0;
		const ratio = wholeLoc > 0 ? surfaceLoc / wholeLoc : 0;
		const privateLoc = Math.max(0, wholeLoc - surfaceLoc);
		const outDegree = outDeg.get(path) ?? 0;
		const inDegree = inDeg.get(path) ?? 0;

		if (ratio >= publicMinRatio) {
			publicMass.push({
				id: path,
				path,
				wholeLoc,
				surfaceLoc,
				ratio,
				outDegree,
				inDegree,
				epistemic: 'observed',
			});
		}

		if (ratio <= icebergMaxRatio && privateLoc >= minPrivate) {
			icebergs.push({
				id: path,
				path,
				wholeLoc,
				surfaceLoc,
				privateLoc,
				ratio,
				outDegree,
				inDegree,
				epistemic: 'observed',
			});
		}
	}

	publicMass.sort(
		(a, b) =>
			b.surfaceLoc - a.surfaceLoc || a.path.localeCompare(b.path),
	);
	icebergs.sort(
		(a, b) =>
			b.privateLoc - a.privateLoc || a.path.localeCompare(b.path),
	);

	const cap = Math.max(0, limit);
	return {
		publicMass: publicMass.slice(0, cap),
		icebergs: icebergs.slice(0, cap),
	};
}
