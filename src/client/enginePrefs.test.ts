import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexFiles, type VirtualFile } from '@core/index.ts';
import {
	ENGINE_PREF_ENABLED_KEY,
	ENGINE_PREF_KEY,
	languageFamiliesFromGraph,
	languageFamilyFromDisplayTag,
	parseEnginePrefMap,
	readEnginePrefEnabled,
	readEnginePrefs,
	recordPrecisionPreference,
	stickyOpenAction,
	writeEnginePref,
	writeEnginePrefEnabled,
	writeEnginePrefs,
} from './enginePrefs.ts';

function vf(path: string, content: string): VirtualFile {
	return { path, content, byteLength: content.length };
}

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

describe('enginePrefs pure helpers', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', memStorage());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('maps display tags to families (TS+JS → js-ts)', () => {
		expect(languageFamilyFromDisplayTag('TypeScript')).toBe('js-ts');
		expect(languageFamilyFromDisplayTag('JavaScript')).toBe('js-ts');
		expect(languageFamilyFromDisplayTag('Python')).toBe('python');
		expect(languageFamilyFromDisplayTag('Astro')).toBe('astro');
		expect(languageFamilyFromDisplayTag('Ruby')).toBe('other');
	});

	it('collects families from graph sources', () => {
		const { graph } = indexFiles([
			vf('src/a.ts', 'export const a = 1;\n'),
			vf('app/main.py', 'import os\n'),
			vf('page.astro', '---\nconst x = 1\n---\n'),
		]);
		expect(languageFamiliesFromGraph(graph)).toEqual([
			'js-ts',
			'python',
			'astro',
		]);
	});

	it('enabled defaults true when unset', () => {
		expect(readEnginePrefEnabled()).toBe(true);
		writeEnginePrefEnabled(false);
		expect(readEnginePrefEnabled()).toBe(false);
		expect(localStorage.getItem(ENGINE_PREF_ENABLED_KEY)).toBe('0');
		writeEnginePrefEnabled(true);
		expect(localStorage.getItem(ENGINE_PREF_ENABLED_KEY)).toBe('1');
	});

	it('parse/serialize map rejects junk keys and values', () => {
		expect(parseEnginePrefMap('not-json')).toEqual({});
		expect(
			parseEnginePrefMap(
				JSON.stringify({
					'js-ts': 'program',
					python: 'estimate',
					bogus: 'exact',
					astro: 'nope',
				}),
			),
		).toEqual({ 'js-ts': 'program', python: 'estimate' });
		// astro:nope → parseLocPrecision → estimate but only accept exact strings
		// so astro is dropped (v was 'nope')
	});

	it('writeEnginePref merges when enabled', () => {
		writeEnginePref('js-ts', 'exact');
		expect(readEnginePrefs()).toEqual({ 'js-ts': 'exact' });
		writeEnginePref('python', 'estimate');
		expect(readEnginePrefs()).toEqual({
			'js-ts': 'exact',
			python: 'estimate',
		});
		const raw = localStorage.getItem(ENGINE_PREF_KEY);
		expect(raw).toContain('js-ts');
	});

	it('writeEnginePref no-ops when caching disabled', () => {
		writeEnginePrefEnabled(false);
		writeEnginePref('js-ts', 'program');
		expect(readEnginePrefs()).toEqual({});
	});

	it('recordPrecisionPreference: Exact/Program write js-ts only', () => {
		const { graph } = indexFiles([
			vf('src/a.ts', 'export const a = 1;\n'),
			vf('app/main.py', 'x = 1\n'),
		]);
		recordPrecisionPreference(graph, 'exact');
		expect(readEnginePrefs()).toEqual({ 'js-ts': 'exact' });
		recordPrecisionPreference(graph, 'program');
		expect(readEnginePrefs()).toEqual({ 'js-ts': 'program' });
	});

	it('recordPrecisionPreference: Exact on Python-only writes nothing', () => {
		const { graph } = indexFiles([vf('app/main.py', 'x = 1\n')]);
		recordPrecisionPreference(graph, 'exact');
		expect(readEnginePrefs()).toEqual({});
	});

	it('recordPrecisionPreference: Estimate demotes all present families', () => {
		writeEnginePrefs({ 'js-ts': 'program', python: 'estimate' });
		const { graph } = indexFiles([
			vf('src/a.ts', 'export const a = 1;\n'),
			vf('app/main.py', 'x = 1\n'),
		]);
		recordPrecisionPreference(graph, 'estimate');
		expect(readEnginePrefs()).toEqual({
			'js-ts': 'estimate',
			python: 'estimate',
		});
	});

	it('stickyOpenAction: prefs off → auto-local', () => {
		const { graph } = indexFiles([
			vf('src/a.ts', 'export const a = 1;\n'),
		]);
		expect(stickyOpenAction(graph, { 'js-ts': 'program' }, false)).toBe(
			'auto-local',
		);
	});

	it('stickyOpenAction: Exact/Program when graph needs TS', () => {
		const { graph } = indexFiles([
			vf('src/a.ts', 'export const a = 1;\n'),
		]);
		expect(stickyOpenAction(graph, { 'js-ts': 'exact' }, true)).toBe(
			'exact',
		);
		expect(stickyOpenAction(graph, { 'js-ts': 'program' }, true)).toBe(
			'program',
		);
	});

	it('stickyOpenAction: explicit estimate demotion skips auto-local', () => {
		const { graph } = indexFiles([
			vf('src/a.ts', 'export const a = 1;\n'),
		]);
		expect(stickyOpenAction(graph, { 'js-ts': 'estimate' }, true)).toBe(
			'stay-estimate',
		);
	});

	it('stickyOpenAction: unset pref → auto-local; Python-only → auto-local', () => {
		const ts = indexFiles([vf('src/a.ts', 'export const a = 1;\n')]).graph;
		const py = indexFiles([vf('app/main.py', 'x = 1\n')]).graph;
		expect(stickyOpenAction(ts, {}, true)).toBe('auto-local');
		expect(stickyOpenAction(py, { 'js-ts': 'exact' }, true)).toBe(
			'auto-local',
		);
	});
});
