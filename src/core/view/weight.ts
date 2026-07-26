/**
 * Alluvial band-width weight axes (projection-time only).
 * Graph edges stay unweighted; projectors call edgeWeight per edge.
 *
 * Imported-surface precision:
 * - estimate — whole-file target LOC (no LSP); labeled as estimate
 * - exact — not implemented (needs language server / program analysis)
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';

/** Selectable band-width axes. Default is unit-1 import edges. */
export type WeightAxis = 'import-edges' | 'importer-loc' | 'target-loc';

/**
 * Honesty mode for imported-surface claims (target-loc + inspect imported code).
 * Default estimate; exact refuses rather than silently falling back.
 */
export type LocPrecision = 'estimate' | 'exact';

export type WeightResolution =
	| { ok: true; axis: WeightAxis; precision: LocPrecision }
	| {
			ok: false;
			reason: 'exact-not-implemented';
			axis: WeightAxis;
			precision: LocPrecision;
			message: string;
	  };

const DEFAULT_AXIS: WeightAxis = 'import-edges';
const DEFAULT_PRECISION: LocPrecision = 'estimate';

export const EXACT_NOT_IMPLEMENTED_MESSAGE =
	'Exact imported LOC requires a language server (not implemented)';

/** Axes that claim imported-surface size (not raw edge counts or importer file size). */
export function axisNeedsImportedSurface(axis: WeightAxis): boolean {
	return axis === 'target-loc';
}

/**
 * Integer line count from source text (newline-based).
 * Empty → 0; trailing content without final newline still counts as a line.
 */
export function lineCount(text: string): number {
	if (!text) return 0;
	let n = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10 /* \n */) n += 1;
	}
	// Non-empty text without trailing newline still has a last line
	if (text.charCodeAt(text.length - 1) !== 10) n += 1;
	return n;
}

/** LOC of a file path from graph.contents; 0 if missing. */
export function fileLineCount(graph: CodeGraph, path: string): number {
	const text = graph.contents.get(path);
	if (text === undefined) return 0;
	return lineCount(text);
}

/**
 * Weight for one observed import edge under the chosen axis.
 * - import-edges: always 1
 * - importer-loc: LOC of e.from (min 1 if empty/missing)
 * - target-loc: LOC of e.to when file; else 1 (package/unresolved fallback)
 */
export function edgeWeight(
	e: ImportEdge,
	graph: CodeGraph,
	axis: WeightAxis = DEFAULT_AXIS,
): number {
	switch (axis) {
		case 'import-edges':
			return 1;
		case 'importer-loc': {
			const n = fileLineCount(graph, e.from);
			return n > 0 ? n : 1;
		}
		case 'target-loc': {
			if (e.toKind === 'file') {
				const n = fileLineCount(graph, e.to);
				return n > 0 ? n : 1;
			}
			// Package / unresolved: no observed package source LOC
			return 1;
		}
		default: {
			const _exhaustive: never = axis;
			return _exhaustive;
		}
	}
}

/**
 * Carbon `units` string for the axis.
 * `context` only affects the import-edges label (forward package-mass vs reverse edges).
 * LOC labels are honest: package/unresolved under target-loc fall back to 1, not package LOC.
 * target-loc is always an estimate under Level-1 (whole target file).
 */
export function unitsForAxis(
	axis: WeightAxis = DEFAULT_AXIS,
	context: 'package-mass' | 'import-edges' = 'import-edges',
): string {
	switch (axis) {
		case 'import-edges':
			return context === 'package-mass' ? 'package imports' : 'import edges';
		case 'importer-loc':
			return 'importer lines of code';
		case 'target-loc':
			return 'estimated imported file lines (packages = 1)';
		default: {
			const _exhaustive: never = axis;
			return _exhaustive;
		}
	}
}

export function resolveWeightAxis(axis?: WeightAxis): WeightAxis {
	return axis ?? DEFAULT_AXIS;
}

export function resolveLocPrecision(precision?: LocPrecision): LocPrecision {
	return precision ?? DEFAULT_PRECISION;
}

/**
 * Gate weight requests that claim exact imported surface.
 * exact + target-loc → fail (no silent fallback to estimate numbers).
 * Other axes are ok under exact (they do not claim imported-surface truth).
 */
export function resolveWeightRequest(
	axis?: WeightAxis,
	precision?: LocPrecision,
): WeightResolution {
	const a = resolveWeightAxis(axis);
	const p = resolveLocPrecision(precision);
	if (p === 'exact' && axisNeedsImportedSurface(a)) {
		return {
			ok: false,
			reason: 'exact-not-implemented',
			axis: a,
			precision: p,
			message: EXACT_NOT_IMPLEMENTED_MESSAGE,
		};
	}
	return { ok: true, axis: a, precision: p };
}
