/**
 * Projection-bar sticky controls (Depth, Weight, Band order, Include tests).
 *
 * Registered via {@link defineControlPref} so new chrome slots share one
 * storage map + the splash **Remember preferences** gate.
 */
import { HUB_DEFAULT_MAX_DEPTH, type BandSortMode, type WeightAxis } from '@core/index.ts';
import { defineControlPref, writeControlPrefsPatch } from './prefsStore.ts';

const WEIGHT_AXES: readonly WeightAxis[] = [
	'import-edges',
	'importer-loc',
	'target-loc',
];
/** Product weight dropdown values, including UI-only Export surface (Exact). */
const WEIGHT_UI_VALUES = [
	'import-edges',
	'importer-loc',
	'target-loc',
	'imported-loc',
] as const;
export type WeightUiValue = (typeof WEIGHT_UI_VALUES)[number];

const BAND_SORT_MODES: readonly BandSortMode[] = ['name', 'node'];

function parseStoredWeightAxis(raw: unknown): WeightAxis | undefined {
	return typeof raw === 'string' && (WEIGHT_AXES as readonly string[]).includes(raw)
		? (raw as WeightAxis)
		: undefined;
}

function parseStoredWeightUi(raw: unknown): WeightUiValue | undefined {
	return typeof raw === 'string' &&
		(WEIGHT_UI_VALUES as readonly string[]).includes(raw)
		? (raw as WeightUiValue)
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

function parseStoredIncludeTests(raw: unknown): boolean | undefined {
	if (typeof raw === 'boolean') return raw;
	if (raw === '1' || raw === 'true') return true;
	if (raw === '0' || raw === 'false') return false;
	return undefined;
}

/**
 * Projector axis only (no shaken UI value). Kept for legacy map key
 * `weightAxis`; prefer {@link weightUiPref} for full dropdown surface.
 */
export const weightAxisPref = defineControlPref<WeightAxis>({
	id: 'weightAxis',
	parse: parseStoredWeightAxis,
	default: 'target-loc',
});

/**
 * Weight dropdown product value, including Export surface (Exact) =
 * `imported-loc` (axis is still target-loc + Exact).
 */
export const weightUiPref = defineControlPref<WeightUiValue>({
	id: 'weightUi',
	parse: parseStoredWeightUi,
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

/** Include test-like paths in the index (web default off). */
export const includeTestsPref = defineControlPref<boolean>({
	id: 'includeTests',
	parse: parseStoredIncludeTests,
	default: false,
});

/**
 * Snapshot current projection chrome into storage (when prefs enabled).
 * Call after user toggles Remember preferences on, or after user edits.
 * Single atomic write so partial maps cannot race.
 */
export function writeProjectionPrefs(opts: {
	/** Full weight dropdown value (may be imported-loc). */
	weightUi: WeightUiValue;
	bandSort: BandSortMode;
	maxDepth: number;
	includeTests: boolean;
}): void {
	const axis: WeightAxis =
		opts.weightUi === 'imported-loc' ? 'target-loc' : opts.weightUi;
	writeControlPrefsPatch({
		[weightUiPref.id]: opts.weightUi,
		// Keep legacy key in sync for older readers
		[weightAxisPref.id]: axis,
		[bandSortPref.id]: opts.bandSort,
		[maxDepthPref.id]: opts.maxDepth,
		[includeTestsPref.id]: opts.includeTests,
	});
}

/**
 * Hydrate host bag from storage. Only applies keys that are present+valid
 * so product defaults stay until the user has chosen.
 */
export function readProjectionPrefs(): {
	weightUi?: WeightUiValue;
	/** Legacy axis-only (when weightUi absent). */
	weightAxis?: WeightAxis;
	bandSort?: BandSortMode;
	maxDepth?: number;
	includeTests?: boolean;
} {
	const out: {
		weightUi?: WeightUiValue;
		weightAxis?: WeightAxis;
		bandSort?: BandSortMode;
		maxDepth?: number;
		includeTests?: boolean;
	} = {};
	const ui = weightUiPref.peek();
	if (ui !== undefined) {
		out.weightUi = ui;
	} else {
		// Migrate older blobs that only stored weightAxis
		const w = weightAxisPref.peek();
		if (w !== undefined) {
			out.weightAxis = w;
			out.weightUi = w;
		}
	}
	const b = bandSortPref.peek();
	if (b !== undefined) out.bandSort = b;
	const d = maxDepthPref.peek();
	if (d !== undefined) out.maxDepth = d;
	const t = includeTestsPref.peek();
	if (t !== undefined) out.includeTests = t;
	return out;
}

/** Map UI weight value → projector axis. */
export function weightAxisFromUi(ui: WeightUiValue): WeightAxis {
	return ui === 'imported-loc' ? 'target-loc' : ui;
}
