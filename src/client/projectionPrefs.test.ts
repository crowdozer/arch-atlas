import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUB_DEFAULT_MAX_DEPTH } from '@core/index.ts';
import { CONTROL_PREFS_KEY, writePrefsEnabled } from './prefsStore.ts';
import {
	bandSortPref,
	includeTestsPref,
	maxDepthPref,
	readProjectionPrefs,
	weightAxisFromUi,
	weightAxisPref,
	weightUiPref,
	writeProjectionPrefs,
} from './projectionPrefs.ts';

function memStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear() {
			map.clear();
		},
		getItem(k: string) {
			return map.has(k) ? map.get(k)! : null;
		},
		setItem(k: string, v: string) {
			map.set(k, String(v));
		},
		removeItem(k: string) {
			map.delete(k);
		},
		key(i: number) {
			return [...map.keys()][i] ?? null;
		},
	};
}

describe('projectionPrefs', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', memStorage());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('defaults when empty', () => {
		expect(weightUiPref.read()).toBe('target-loc');
		expect(weightAxisPref.read()).toBe('target-loc');
		expect(bandSortPref.read()).toBe('name');
		expect(maxDepthPref.read()).toBe(HUB_DEFAULT_MAX_DEPTH);
		expect(includeTestsPref.read()).toBe(false);
		expect(readProjectionPrefs()).toEqual({});
	});

	it('writeProjectionPrefs / readProjectionPrefs round-trip', () => {
		writeProjectionPrefs({
			weightUi: 'import-edges',
			bandSort: 'node',
			maxDepth: 10,
			includeTests: true,
		});
		expect(readProjectionPrefs()).toEqual({
			weightUi: 'import-edges',
			bandSort: 'node',
			maxDepth: 10,
			includeTests: true,
		});
		const raw = JSON.parse(localStorage.getItem(CONTROL_PREFS_KEY) ?? '{}') as Record<
			string,
			unknown
		>;
		expect(raw.weightUi).toBe('import-edges');
		expect(raw.weightAxis).toBe('import-edges');
		expect(raw.bandSort).toBe('node');
		expect(raw.maxDepth).toBe(10);
		expect(raw.includeTests).toBe(true);
	});

	it('stores Export surface Exact weight UI as imported-loc; axis target-loc', () => {
		writeProjectionPrefs({
			weightUi: 'imported-loc',
			bandSort: 'name',
			maxDepth: 3,
			includeTests: false,
		});
		expect(readProjectionPrefs()).toEqual({
			weightUi: 'imported-loc',
			bandSort: 'name',
			maxDepth: 3,
			includeTests: false,
		});
		const raw = JSON.parse(localStorage.getItem(CONTROL_PREFS_KEY) ?? '{}') as Record<
			string,
			unknown
		>;
		expect(raw.weightUi).toBe('imported-loc');
		expect(raw.weightAxis).toBe('target-loc');
		expect(weightAxisFromUi('imported-loc')).toBe('target-loc');
	});

	it('migrates legacy weightAxis-only blobs', () => {
		localStorage.setItem(
			CONTROL_PREFS_KEY,
			JSON.stringify({ weightAxis: 'importer-loc' }),
		);
		expect(readProjectionPrefs()).toEqual({
			weightUi: 'importer-loc',
			weightAxis: 'importer-loc',
		});
	});

	it('rejects unknown weightUi / band and clamps depth', () => {
		localStorage.setItem(
			CONTROL_PREFS_KEY,
			JSON.stringify({
				weightUi: 'nope',
				bandSort: 'flow',
				maxDepth: 99,
			}),
		);
		expect(readProjectionPrefs()).toEqual({ maxDepth: 32 });
		expect(weightUiPref.peek()).toBeUndefined();
		expect(bandSortPref.peek()).toBeUndefined();
	});

	it('no write when prefs disabled', () => {
		writePrefsEnabled(false);
		writeProjectionPrefs({
			weightUi: 'importer-loc',
			bandSort: 'node',
			maxDepth: 5,
			includeTests: true,
		});
		expect(readProjectionPrefs()).toEqual({});
	});
});
