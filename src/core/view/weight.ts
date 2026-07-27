/**
 * Alluvial band-width weight axes (projection-time only).
 * Graph edges stay unweighted; projectors call edgeWeight per edge.
 *
 * Imported-surface precision:
 * - estimate — whole-file target LOC (no Program/LSP); labeled as estimate
 * - exact — requires {@link ImportedSurfaceProvider}; fails closed when absent
 *   (no silent fallback to estimate numbers). Under exact + target-loc,
 *   mass comes from `surface.targetSurfaceMass` (null → 1, never whole-file).
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';

/** Selectable band-width axes. Default is whole-file imported (target) LOC. */
export type WeightAxis = 'import-edges' | 'importer-loc' | 'target-loc';

/**
 * Honesty mode for imported-surface claims (target-loc + inspect imported code).
 * Default estimate; exact refuses rather than silently falling back.
 */
export type LocPrecision = 'estimate' | 'exact';

/** Optional Exact mass inputs for {@link edgeWeight}. */
export type EdgeWeightOpts = {
	precision?: LocPrecision;
	surface?: ImportedSurfaceProvider | null;
};

export type WeightResolution =
	| { ok: true; axis: WeightAxis; precision: LocPrecision }
	| {
			ok: false;
			reason: 'exact-not-implemented';
			axis: WeightAxis;
			precision: LocPrecision;
			message: string;
	  };

/** UI default Weight dropdown: “Imported LOC” (`target-loc`). */
const DEFAULT_AXIS: WeightAxis = 'target-loc';
const DEFAULT_PRECISION: LocPrecision = 'estimate';

export const EXACT_NOT_IMPLEMENTED_MESSAGE =
	'Exact export-surface mass requires the JS/TS analysis engine (classic TypeScript AST — not a language server). Enable Precision → Exact (export surface) or Weight → Export surface after the engine loads, or inject a provider.';

/** Provider present but export surface could not be resolved for this edge. */
export const EXACT_SURFACE_UNRESOLVED_MESSAGE =
	'Export surface not resolved for imported bindings (Exact — no silent whole-file fallback).';

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
 * Normalize provider mass for chart bands under exact.
 * - null / non-finite → 1 (not whole-file estimate)
 * - 0 → 1 (visible band; side-effect / type-only may still use 1)
 * - n > 0 → max(1, floor(n))
 */
export function normalizeExactSurfaceMass(mass: number | null | undefined): number {
	if (mass == null || !Number.isFinite(mass)) return 1;
	if (mass <= 0) return 1;
	return Math.max(1, Math.floor(mass));
}

/**
 * Weight for one observed import edge under the chosen axis.
 * - import-edges: always 1
 * - importer-loc: LOC of e.from (min 1 if empty/missing)
 * - target-loc (estimate): LOC of e.to when file; else 1 (package/unresolved)
 * - target-loc (exact + surface): provider mass; null → 1 (never whole-file)
 *
 * For **hub export-side** (reverse edges into the focus file), prefer
 * {@link hubReverseEdgeWeight}: plain target-loc makes every importer share the
 * focus file’s LOC (degenerate bands).
 */
export function edgeWeight(
	e: ImportEdge,
	graph: CodeGraph,
	axis: WeightAxis = DEFAULT_AXIS,
	opts?: EdgeWeightOpts,
): number {
	switch (axis) {
		case 'import-edges':
			return 1;
		case 'importer-loc': {
			const n = fileLineCount(graph, e.from);
			return n > 0 ? n : 1;
		}
		case 'target-loc': {
			const precision = opts?.precision ?? DEFAULT_PRECISION;
			const surface = opts?.surface;
			// Exact mode: never emit whole-file estimate numbers (defense-in-depth).
			// With surface → provider mass (null → 1). Without surface → 1.
			if (precision === 'exact') {
				if (e.toKind !== 'file') return 1;
				if (surface) {
					const mass = surface.targetSurfaceMass(graph, e);
					return normalizeExactSurfaceMass(mass);
				}
				return 1;
			}
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
 * Mass for reverse hub edges (importer → focus) under dual-side honesty.
 *
 * Under plain {@link edgeWeight} + `target-loc`, every reverse edge shares
 * `e.to === focus` so export bands are identical. Instead:
 * - **exact + surface**: focus export surface for this edge’s bindings
 *   (unresolved → importer LOC, never whole-focus file)
 * - **estimate target-loc**: importer file LOC (consumer size)
 * - other axes: same as {@link edgeWeight}
 */
export function hubReverseEdgeWeight(
	e: ImportEdge,
	graph: CodeGraph,
	axis: WeightAxis = DEFAULT_AXIS,
	opts?: EdgeWeightOpts,
): number {
	if (axis !== 'target-loc') {
		return edgeWeight(e, graph, axis, opts);
	}
	const precision = opts?.precision ?? DEFAULT_PRECISION;
	const surface = opts?.surface;
	const importerLoc = (() => {
		const n = fileLineCount(graph, e.from);
		return n > 0 ? n : 1;
	})();

	if (precision === 'exact') {
		if (e.toKind !== 'file') return 1;
		if (surface) {
			const mass = surface.targetSurfaceMass(graph, e);
			// Resolved surface → use it; unresolved → importer size (not focus whole-file, not flat 1)
			if (mass != null && Number.isFinite(mass) && mass > 0) {
				return normalizeExactSurfaceMass(mass);
			}
			return importerLoc;
		}
		return importerLoc;
	}

	// estimate target-loc on reverse: consumer size, not shared focus file LOC
	return importerLoc;
}

/**
 * Carbon `units` string for the axis (honest names — see UI Weight dropdown).
 * Under exact + target-loc, labels surface honesty (not whole-file).
 */
export function unitsForAxis(
	axis: WeightAxis = DEFAULT_AXIS,
	context: 'package-mass' | 'import-edges' = 'import-edges',
	precision?: LocPrecision,
): string {
	switch (axis) {
		case 'import-edges':
			return context === 'package-mass' ? 'package imports' : 'import edges';
		case 'importer-loc':
			return 'importer file LOC';
		case 'target-loc':
			if (precision === 'exact') {
				return 'imported surface LOC (exact; export side: surface or importer LOC)';
			}
			return 'imported LOC (imports: target file; exports: importer file)';
		default: {
			const _exhaustive: never = axis;
			return _exhaustive;
		}
	}
}

/**
 * UI-only weight choice for Exact surface mode entry.
 * Maps to axis `target-loc` + precision `exact` once engines are ready.
 */
export const IMPORTED_SURFACE_LOC_UI = 'imported-loc' as const;

export const IMPORTED_SURFACE_LOC_MESSAGE =
	'Export surface (Exact) sizes bands by matching import bindings to export declarations (classic TypeScript AST). Not bundler tree-shake and not a language server. Loads the engine when selected (same path as Precision → Exact).';

export function resolveWeightAxis(axis?: WeightAxis): WeightAxis {
	return axis ?? DEFAULT_AXIS;
}

export function resolveLocPrecision(precision?: LocPrecision): LocPrecision {
	return precision ?? DEFAULT_PRECISION;
}

/** Pick edge-weight opts from a projector options bag (omits empty). */
export function pickEdgeWeightOpts(
	opts?: {
		precision?: LocPrecision;
		surface?: ImportedSurfaceProvider | null;
	} | null,
): EdgeWeightOpts | undefined {
	if (!opts) return undefined;
	if (opts.precision === undefined && opts.surface === undefined) return undefined;
	const out: EdgeWeightOpts = {};
	if (opts.precision !== undefined) out.precision = opts.precision;
	if (opts.surface !== undefined) out.surface = opts.surface;
	return out;
}

/**
 * Gate weight requests that claim exact imported surface.
 * exact + target-loc → ok only when an {@link ImportedSurfaceProvider} is
 * supplied. Without a provider → fail closed (no silent fallback to estimate).
 * Other axes are ok under exact (they do not claim imported-surface truth).
 */
export function resolveWeightRequest(
	axis?: WeightAxis,
	precision?: LocPrecision,
	surface?: ImportedSurfaceProvider | null,
): WeightResolution {
	const a = resolveWeightAxis(axis);
	const p = resolveLocPrecision(precision);
	if (p === 'exact' && axisNeedsImportedSurface(a)) {
		if (surface) {
			return { ok: true, axis: a, precision: p };
		}
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
