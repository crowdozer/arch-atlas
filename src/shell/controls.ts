/**
 * Pure control parsers + weight-precision gate (no DOM).
 */
import {
	DEFAULT_SPINE_FORMULA,
	HUB_DEFAULT_MAX_DEPTH,
	IMPORTED_SURFACE_LOC_UI,
	SPINE_FORMULAS,
	resolveWeightRequest,
	type BandSortMode,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type SpineFormula,
	type WeightAxis,
} from '@core/index.ts';
import type { InteractionMode } from '@shell/types.ts';

const WEIGHT_AXES: WeightAxis[] = ['import-edges', 'importer-loc', 'target-loc'];
const LOC_PRECISIONS: LocPrecision[] = ['estimate', 'exact', 'program'];
/** Product-live modes (dropdown). API still accepts flow* via BandSortMode. */
const BAND_SORT_MODES: BandSortMode[] = ['name', 'node'];

/** Exported for UI lists / tests. */
export { LOC_PRECISIONS, BAND_SORT_MODES };
export type { BandSortMode };

export function parseWeightAxis(raw: string): WeightAxis {
	return (WEIGHT_AXES as string[]).includes(raw) ? (raw as WeightAxis) : 'target-loc';
}

/**
 * Parse stage band-order mode (product surface).
 * - Live: name | node
 * - Legacy / experiment: mass | flow | flow-target | dir-walk | unknown → name
 * Flow mass helpers remain callable via API `bandSort: 'flow'|…` for tests;
 * host parse never returns them so old dumps cannot select broken UX.
 */
export function parseBandSortMode(raw: string): BandSortMode {
	return (BAND_SORT_MODES as string[]).includes(raw)
		? (raw as BandSortMode)
		: 'name';
}

/** Parse spine formula select value; unknown → default modules-then-in. */
export function parseSpineFormula(raw: string): SpineFormula {
	return (SPINE_FORMULAS as readonly string[]).includes(raw)
		? (raw as SpineFormula)
		: DEFAULT_SPINE_FORMULA;
}

/**
 * True when the weight dropdown value is the UI-only Shaken entry
 * (maps to target-loc + exact once engines are ready).
 */
export function isShakenWeightUi(raw: string): boolean {
	return raw === IMPORTED_SURFACE_LOC_UI || raw === 'imported-loc';
}

export function parseLocPrecision(raw: string): LocPrecision {
	return (LOC_PRECISIONS as string[]).includes(raw)
		? (raw as LocPrecision)
		: 'estimate';
}

/**
 * Precision for export-surface claims (public mass, icebergs, target-loc band
 * mass, inspect imported surface). Chrome may stay `program` while Exact mass
 * is rehydrated (`programExactMass`); core only honors surface when precision
 * is `'exact'`, so the host remaps at this boundary.
 *
 * - program + rehydrated Exact mass → `'exact'`
 * - program without mass → `'estimate'` (topology only; no public mass claim)
 * - else → chrome precision unchanged
 */
export function precisionForSurfaceClaims(
	locPrecision: LocPrecision,
	programExactMass: boolean,
): LocPrecision {
	if (locPrecision === 'program') {
		return programExactMass ? 'exact' : 'estimate';
	}
	return locPrecision;
}

export function parseInteractionMode(raw: string): InteractionMode {
	return raw === 'inspect' ? 'inspect' : 'drill';
}

export function parseVizMaxDepth(raw: string): number {
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 1) return HUB_DEFAULT_MAX_DEPTH;
	return Math.min(32, Math.floor(n));
}

/**
 * When exact + target-loc (imported surface), refuse remount with estimate numbers.
 * Fail-closed via {@link resolveWeightRequest} unless a surface provider is present.
 */
export function canMountWeight(
	axis: WeightAxis,
	precision: LocPrecision,
	surface?: ImportedSurfaceProvider | null,
): { ok: true } | { ok: false; message: string } {
	const r = resolveWeightRequest(axis, precision, surface);
	if (!r.ok) return { ok: false, message: r.message };
	return { ok: true };
}
