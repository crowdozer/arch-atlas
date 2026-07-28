import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUB_DEFAULT_MAX_DEPTH } from '@core/index.ts';
import { CONTROL_PREFS_KEY, writePrefsEnabled } from './prefsStore.ts';
import {
	bandSortPref,
	maxDepthPref,
	readProjectionPrefs,
	weightAxisPref,
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
		expect(weightAxisPref.read()).toBe('target-loc');
		expect(bandSortPref.read()).toBe('name');
		expect(maxDepthPref.read()).toBe(HUB_DEFAULT_MAX_DEPTH);
		expect(readProjectionPrefs()).toEqual({});
	});

	it('writeProjectionPrefs / readProjectionPrefs round-trip', () => {
		writeProjectionPrefs({
			weightAxis: 'import-edges',
			bandSort: 'node',
			maxDepth: 10,
		});
		expect(readProjectionPrefs()).toEqual({
			weightAxis: 'import-edges',
			bandSort: 'node',
			maxDepth: 10,
		});
		const raw = JSON.parse(localStorage.getItem(CONTROL_PREFS_KEY) ?? '{}') as Record<
			string,
			unknown
		>;
		expect(raw.weightAxis).toBe('import-edges');
		expect(raw.bandSort).toBe('node');
		expect(raw.maxDepth).toBe(10);
	});

	it('rejects shaken / unknown weight and clamps depth', () => {
		localStorage.setItem(
			CONTROL_PREFS_KEY,
			JSON.stringify({
				weightAxis: 'imported-loc',
				bandSort: 'flow',
				maxDepth: 99,
			}),
		);
		expect(readProjectionPrefs()).toEqual({ maxDepth: 32 });
		expect(weightAxisPref.peek()).toBeUndefined();
		expect(bandSortPref.peek()).toBeUndefined();
	});

	it('no write when prefs disabled', () => {
		writePrefsEnabled(false);
		writeProjectionPrefs({
			weightAxis: 'importer-loc',
			bandSort: 'node',
			maxDepth: 5,
		});
		expect(readProjectionPrefs()).toEqual({});
	});
});
