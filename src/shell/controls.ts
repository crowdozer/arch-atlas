/**
 * Pure control parsers + weight-precision gate (no DOM).
 */
import {
	HUB_DEFAULT_MAX_DEPTH,
	resolveWeightRequest,
	type LocPrecision,
	type WeightAxis,
} from '@core/index.ts';
import type { InteractionMode } from '@shell/types.ts';

const WEIGHT_AXES: WeightAxis[] = ['import-edges', 'importer-loc', 'target-loc'];
const LOC_PRECISIONS: LocPrecision[] = ['estimate', 'exact'];

export function parseWeightAxis(raw: string): WeightAxis {
	return (WEIGHT_AXES as string[]).includes(raw) ? (raw as WeightAxis) : 'target-loc';
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
 * Fail-closed via {@link resolveWeightRequest} without a surface provider.
 */
export function canMountWeight(
	axis: WeightAxis,
	precision: LocPrecision,
): { ok: true } | { ok: false; message: string } {
	const r = resolveWeightRequest(axis, precision);
	if (!r.ok) return { ok: false, message: r.message };
	return { ok: true };
}
