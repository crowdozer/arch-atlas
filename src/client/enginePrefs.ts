/**
 * Sticky language-engine precision preferences (localStorage).
 *
 * Stores a map LanguageFamily → LocPrecision plus an enabled flag.
 * Does **not** cache multi-MB TypeScript compiler blobs — engines still load
 * via inject / local classic / CDN as today when Exact/Program is applied.
 */
import {
	graphNeedsTypescript,
	type CodeGraph,
	type LocPrecision,
} from '@core/index.ts';
import { parseLocPrecision } from '@shell/index.ts';

export const ENGINE_PREF_KEY = 'arch-atlas:engine-pref:v1';
export const ENGINE_PREF_ENABLED_KEY = 'arch-atlas:engine-pref-enabled';

/** Engine/language families for sticky precision (TS+JS share one Exact engine). */
export type LanguageFamily = 'js-ts' | 'python' | 'astro' | 'other';

export type EnginePrefMap = Partial<Record<LanguageFamily, LocPrecision>>;

const FAMILIES: readonly LanguageFamily[] = [
	'js-ts',
	'python',
	'astro',
	'other',
];

const JS_TS_EXT = /\.(m?[jt]sx?|cjs|mjs)$/i;

/** Display language tag (catalog) → family. */
export function languageFamilyFromDisplayTag(tag: string): LanguageFamily {
	const t = tag.trim().toLowerCase();
	if (t === 'typescript' || t === 'javascript') return 'js-ts';
	if (t === 'python') return 'python';
	if (t === 'astro') return 'astro';
	return 'other';
}

/** Families present among source files in the graph (unique, stable order). */
export function languageFamiliesFromGraph(graph: CodeGraph): LanguageFamily[] {
	const found = new Set<LanguageFamily>();
	for (const [path, file] of graph.files) {
		if (!file.isSource) continue;
		const kind = graph.parseMap.get(path)?.kind ?? file.parseKind;
		if (kind === 'js-ts-import' || JS_TS_EXT.test(path)) {
			found.add('js-ts');
		} else if (kind === 'python-import' || /\.py$/i.test(path)) {
			found.add('python');
		} else if (kind === 'astro-import' || /\.astro$/i.test(path)) {
			found.add('astro');
		} else if (kind === 'unsupported-language') {
			found.add('other');
		}
	}
	return FAMILIES.filter((f) => found.has(f));
}

/**
 * What open-path should do given sticky prefs.
 * - program / exact: re-apply higher-fidelity (may CDN)
 * - stay-estimate: user demoted; skip auto-local Exact
 * - auto-local: no sticky higher tier (or prefs off) → existing local-only auto
 */
export type StickyOpenAction =
	| 'program'
	| 'exact'
	| 'stay-estimate'
	| 'auto-local';

export function stickyOpenAction(
	graph: CodeGraph,
	prefs: EnginePrefMap,
	enabled: boolean,
): StickyOpenAction {
	if (!enabled) return 'auto-local';
	// Higher-fidelity sticky only applies when graph can use the TS engine
	if (!graphNeedsTypescript(graph)) {
		// Explicit estimate sticky on non-TS is a no-op for open path
		return 'auto-local';
	}
	const families = languageFamiliesFromGraph(graph);
	if (!families.includes('js-ts')) return 'auto-local';
	const pref = prefs['js-ts'];
	if (pref === 'program') return 'program';
	if (pref === 'exact') return 'exact';
	if (pref === 'estimate') return 'stay-estimate';
	return 'auto-local';
}

/** Preference defaults on when unset. */
export function readEnginePrefEnabled(): boolean {
	try {
		const raw = localStorage.getItem(ENGINE_PREF_ENABLED_KEY);
		if (raw === null) return true;
		return raw === '1' || raw === 'true';
	} catch {
		return true;
	}
}

export function writeEnginePrefEnabled(on: boolean): void {
	try {
		localStorage.setItem(ENGINE_PREF_ENABLED_KEY, on ? '1' : '0');
	} catch {
		/* private mode / blocked storage */
	}
}

export function parseEnginePrefMap(raw: string): EnginePrefMap {
	try {
		const data = JSON.parse(raw) as unknown;
		if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
		const out: EnginePrefMap = {};
		for (const f of FAMILIES) {
			const v = (data as Record<string, unknown>)[f];
			if (typeof v === 'string') {
				const p = parseLocPrecision(v);
				// Only accept known tiers (parse falls back to estimate for junk)
				if (v === 'estimate' || v === 'exact' || v === 'program') {
					out[f] = p;
				}
			}
		}
		return out;
	} catch {
		return {};
	}
}

export function readEnginePrefs(): EnginePrefMap {
	try {
		const raw = localStorage.getItem(ENGINE_PREF_KEY);
		if (!raw) return {};
		return parseEnginePrefMap(raw);
	} catch {
		return {};
	}
}

export function writeEnginePrefs(map: EnginePrefMap): void {
	try {
		localStorage.setItem(ENGINE_PREF_KEY, JSON.stringify(map));
	} catch {
		/* private mode / blocked storage */
	}
}

/** Merge one family preference into the stored map. No-op when caching disabled. */
export function writeEnginePref(
	family: LanguageFamily,
	precision: LocPrecision,
): void {
	if (!readEnginePrefEnabled()) return;
	const next = { ...readEnginePrefs(), [family]: precision };
	writeEnginePrefs(next);
}

/**
 * After a successful Precision change: Exact/Program stick for `js-ts` only
 * (only loadable engine). Estimate demotion writes for all present families.
 */
export function recordPrecisionPreference(
	graph: CodeGraph,
	precision: LocPrecision,
): void {
	if (!readEnginePrefEnabled()) return;
	const families = languageFamiliesFromGraph(graph);
	if (!families.length) return;

	if (precision === 'exact' || precision === 'program') {
		if (families.includes('js-ts')) {
			writeEnginePref('js-ts', precision);
		}
		return;
	}

	// Estimate: sticky demotion for every family in the open graph
	const next = { ...readEnginePrefs() };
	for (const f of families) {
		next[f] = 'estimate';
	}
	writeEnginePrefs(next);
}
