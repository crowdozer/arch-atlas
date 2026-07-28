/**
 * Projection-bar sticky controls (Depth, Weight, Band order).
 *
 * Registered via {@link defineControlPref} so new chrome slots share one
 * storage map + the splash **Remember preferences** gate.
 */
import { HUB_DEFAULT_MAX_DEPTH, type BandSortMode, type WeightAxis } from '@core/index.ts';
import { defineControlPref } from './prefsStore.ts';

const WEIGHT_AXES: readonly WeightAxis[] = [
	'import-edges',
	'importer-loc',
	'target-loc',
];
const BAND_SORT_MODES: readonly BandSortMode[] = ['name', 'node'];

function parseStoredWeightAxis(raw: unknown): WeightAxis | undefined {
	return typeof raw === 'string' && (WEIGHT_AXES as readonly string[]).includes(raw)
		? (raw as WeightAxis)
		: undefined;
}

function parseStoredBandSort(raw: unknown): BandSortMode | undefined {
	return typeof raw === 'string' && (BAND_SORT_MODES as readonly string[]).includes(raw)
		? (raw as BandSortMode)
		: undefined;
}

function parseStoredMaxDepth(raw: unknown): number | undefined {
	const n =
		typeof raw === 'number'
			? raw
			: typeof raw === 'string'
				? Number.parseInt(raw, 10)
				: NaN;
	if (!Number.isFinite(n) || n < 1) return undefined;
	return Math.min(32, Math.floor(n));
}

/** Band-width axis (not the UI-only Shaken entry). */
export const weightAxisPref = defineControlPref<WeightAxis>({
	id: 'weightAxis',
	parse: parseStoredWeightAxis,
	default: 'target-loc',
});

/** In-column band stack order (product surface: name | node). */
export const bandSortPref = defineControlPref<BandSortMode>({
	id: 'bandSort',
	parse: parseStoredBandSort,
	default: 'name',
});

/**
 * Viz hop depth. When present in storage, host should treat as user-set
 * (stop auto mode defaults).
 */
export const maxDepthPref = defineControlPref<number>({
	id: 'maxDepth',
	parse: parseStoredMaxDepth,
	default: HUB_DEFAULT_MAX_DEPTH,
});

/**
 * Snapshot current projection chrome into storage (when prefs enabled).
 * Call after user toggles Remember preferences on, or after user edits.
 */
export function writeProjectionPrefs(opts: {
	weightAxis: WeightAxis;
	bandSort: BandSortMode;
	maxDepth: number;
}): void {
	weightAxisPref.write(opts.weightAxis);
	bandSortPref.write(opts.bandSort);
	maxDepthPref.write(opts.maxDepth);
}

/**
 * Hydrate host bag from storage. Only applies keys that are present+valid
 * so product defaults stay until the user has chosen.
 */
export function readProjectionPrefs(): {
	weightAxis?: WeightAxis;
	bandSort?: BandSortMode;
	maxDepth?: number;
} {
	const out: {
		weightAxis?: WeightAxis;
		bandSort?: BandSortMode;
		maxDepth?: number;
	} = {};
	const w = weightAxisPref.peek();
	if (w !== undefined) out.weightAxis = w;
	const b = bandSortPref.peek();
	if (b !== undefined) out.bandSort = b;
	const d = maxDepthPref.peek();
	if (d !== undefined) out.maxDepth = d;
	return out;
}
