import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CONTROL_PREFS_KEY,
	PREFS_ENABLED_KEY,
	clearControlPrefRegistryForTests,
	defineControlPref,
	listRegisteredControlPrefIds,
	readPrefsEnabled,
	writePrefsEnabled,
} from './prefsStore.ts';

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

describe('prefsStore', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', memStorage());
		clearControlPrefRegistryForTests();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		clearControlPrefRegistryForTests();
	});

	it('prefs enabled defaults true and round-trips', () => {
		expect(readPrefsEnabled()).toBe(true);
		writePrefsEnabled(false);
		expect(readPrefsEnabled()).toBe(false);
		expect(localStorage.getItem(PREFS_ENABLED_KEY)).toBe('0');
		writePrefsEnabled(true);
		expect(localStorage.getItem(PREFS_ENABLED_KEY)).toBe('1');
	});

	it('defineControlPref read/write/peek with shared map', () => {
		// Unique ids so this suite never collides with projectionPrefs registration
		const depth = defineControlPref({
			id: 'test-maxDepth',
			parse: (r) => (typeof r === 'number' && r >= 1 ? r : undefined),
			default: 3,
		});
		const weight = defineControlPref({
			id: 'test-weightAxis',
			parse: (r) =>
				r === 'import-edges' || r === 'target-loc' ? r : undefined,
			default: 'target-loc' as const,
		});

		expect(listRegisteredControlPrefIds()).toEqual([
			'test-maxDepth',
			'test-weightAxis',
		]);
		expect(depth.read()).toBe(3);
		expect(depth.peek()).toBeUndefined();

		depth.write(7);
		weight.write('import-edges');
		expect(depth.read()).toBe(7);
		expect(weight.read()).toBe('import-edges');

		const raw = JSON.parse(localStorage.getItem(CONTROL_PREFS_KEY) ?? '{}') as Record<
			string,
			unknown
		>;
		expect(raw).toEqual({
			'test-maxDepth': 7,
			'test-weightAxis': 'import-edges',
		});
	});

	it('write no-ops when prefs disabled; storage kept', () => {
		const p = defineControlPref({
			id: 'test-bandSort',
			parse: (r) => (r === 'name' || r === 'node' ? r : undefined),
			default: 'name' as const,
		});
		p.write('node');
		expect(p.read()).toBe('node');

		writePrefsEnabled(false);
		p.write('name');
		expect(p.read()).toBe('node');
	});

	it('rejects junk values via parse → default / undefined peek', () => {
		const p = defineControlPref({
			id: 'test-weight-junk',
			parse: (r) => (r === 'target-loc' ? r : undefined),
			default: 'target-loc' as const,
		});
		localStorage.setItem(
			CONTROL_PREFS_KEY,
			JSON.stringify({ 'test-weight-junk': 'imported-loc' }),
		);
		expect(p.peek()).toBeUndefined();
		expect(p.read()).toBe('target-loc');
	});

	it('re-register same id is allowed (HMR-safe)', () => {
		defineControlPref({
			id: 'test-dup',
			parse: () => undefined,
			default: 0,
		});
		const again = defineControlPref({
			id: 'test-dup',
			parse: (r) => (typeof r === 'number' ? r : undefined),
			default: 1,
		});
		expect(again.default).toBe(1);
		expect(listRegisteredControlPrefIds()).toEqual(['test-dup']);
	});

	it('writeControlPrefsPatch is atomic and gated', async () => {
		const { writeControlPrefsPatch } = await import('./prefsStore.ts');
		writeControlPrefsPatch({ a: 1, b: 2 });
		expect(JSON.parse(localStorage.getItem(CONTROL_PREFS_KEY) ?? '{}')).toEqual({
			a: 1,
			b: 2,
		});
		writePrefsEnabled(false);
		writeControlPrefsPatch({ a: 9 });
		expect(JSON.parse(localStorage.getItem(CONTROL_PREFS_KEY) ?? '{}')).toEqual({
			a: 1,
			b: 2,
		});
	});

	it('applyCheckboxPreference sets property and attribute', async () => {
		const { applyCheckboxPreference } = await import('./prefsStore.ts');
		const attrs = new Map<string, string>();
		const el = {
			checked: false as boolean | undefined,
			setAttribute(name: string, value: string) {
				attrs.set(name, value);
			},
			removeAttribute(name: string) {
				attrs.delete(name);
			},
			hasAttribute(name: string) {
				return attrs.has(name);
			},
		};
		applyCheckboxPreference(el as HTMLElement & { checked?: boolean }, true);
		expect(el.checked).toBe(true);
		expect(el.hasAttribute('checked')).toBe(true);
		applyCheckboxPreference(el as HTMLElement & { checked?: boolean }, false);
		expect(el.checked).toBe(false);
		expect(el.hasAttribute('checked')).toBe(false);
	});
});
