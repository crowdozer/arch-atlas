/**
 * Pure control parsers + weight-precision gate (no DOM).
 */
import {
	DEFAULT_SPINE_FORMULA,
	HUB_DEFAULT_MAX_DEPTH,
	IMPORTED_SURFACE_LOC_UI,
	SPINE_FORMULAS,
	resolveWeightRequest,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type SpineFormula,
	type WeightAxis,
} from '@core/index.ts';
import type { InteractionMode } from '@shell/types.ts';

const WEIGHT_AXES: WeightAxis[] = ['import-edges', 'importer-loc', 'target-loc'];
const LOC_PRECISIONS: LocPrecision[] = ['estimate', 'exact', 'program'];

/** Exported for UI lists / tests. */
export { LOC_PRECISIONS };

export function parseWeightAxis(raw: string): WeightAxis {
	return (WEIGHT_AXES as string[]).includes(raw) ? (raw as WeightAxis) : 'target-loc';
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
