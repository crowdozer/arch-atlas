/**
 * Language → analysis engine map (pure).
 *
 * Used when enabling Exact / surface mode: which engines the graph needs,
 * which are loadable in-tab this ship (typescript only), and which languages
 * stay estimate-only (missing).
 *
 * No network / no Program — hosts load engines and inject providers.
 */

import type { CodeGraph } from '@core/graph/types.ts';

/** Engines the web host can load this ship. */
export type EngineId = 'typescript';

/** Future / non-loadable engine labels (catalog later). */
export type MissingEngineId = string;

export type MissingLanguageEngine = {
	/** Display language name (e.g. Python, Go). */
	language: string;
	/** Optional engine id when known (e.g. python, gopls). */
	engine?: MissingEngineId;
};

export type RequiredEnginesResult = {
	/** Engines that can be loaded for Exact mass this ship. */
	loadable: EngineId[];
	/** Languages present without a loadable engine (stay estimate). */
	missing: MissingLanguageEngine[];
};

/** JS/TS sources → typescript engine (mirrors isSourceFile / js-ts-import). */
const JS_TS_SOURCE_EXT = /\.(m?[jt]sx?|cjs|mjs)$/i;

/**
 * Unsupported source extensions → language label + optional future engine id.
 * Keep aligned with `capability.ts` UNSUPPORTED_SOURCE_EXT where practical.
 */
const UNSUPPORTED_LANG: ReadonlyArray<{
	ext: RegExp;
	language: string;
	engine?: string;
}> = [
	{ ext: /\.py$/i, language: 'Python', engine: 'python' },
	{ ext: /\.rb$/i, language: 'Ruby', engine: 'ruby' },
	{ ext: /\.go$/i, language: 'Go', engine: 'gopls' },
	{ ext: /\.rs$/i, language: 'Rust', engine: 'rust-analyzer' },
	{ ext: /\.java$/i, language: 'Java', engine: 'jdtls' },
	{ ext: /\.kts?$/i, language: 'Kotlin', engine: 'kotlin-lsp' },
	{ ext: /\.php$/i, language: 'PHP', engine: 'phpactor' },
	{ ext: /\.cs$/i, language: 'C#', engine: 'omnisharp' },
	{ ext: /\.swift$/i, language: 'Swift', engine: 'sourcekit' },
	{ ext: /\.scala$/i, language: 'Scala', engine: 'metals' },
	{ ext: /\.clj$/i, language: 'Clojure' },
	{ ext: /\.exs?$/i, language: 'Elixir' },
	{ ext: /\.erl$/i, language: 'Erlang' },
	{ ext: /\.hs$/i, language: 'Haskell' },
	{ ext: /\.lua$/i, language: 'Lua' },
	{ ext: /\.r$/i, language: 'R' },
	{ ext: /\.jl$/i, language: 'Julia' },
	{ ext: /\.vue$/i, language: 'Vue SFC', engine: 'vue-typescript' },
	{ ext: /\.svelte$/i, language: 'Svelte', engine: 'svelte-language-server' },
	{ ext: /\.astro$/i, language: 'Astro', engine: 'astro-ls' },
];

function languageForUnsupported(path: string): MissingLanguageEngine | null {
	for (const row of UNSUPPORTED_LANG) {
		if (row.ext.test(path)) {
			return row.engine
				? { language: row.language, engine: row.engine }
				: { language: row.language };
		}
	}
	// Generic unsupported-language parseKind without a known extension
	return { language: 'unsupported' };
}

/**
 * Derive engines required for Exact honesty over this graph.
 * Config/text assets do not require engines.
 */
export function requiredEngines(graph: CodeGraph): RequiredEnginesResult {
	let needsTypescript = false;
	const missingByKey = new Map<string, MissingLanguageEngine>();

	for (const [path, file] of graph.files) {
		if (file.isSource || JS_TS_SOURCE_EXT.test(path)) {
			needsTypescript = true;
			continue;
		}
		const parse = graph.parseMap.get(path);
		const kind = parse?.kind ?? file.parseKind;
		if (kind === 'unsupported-language') {
			const miss = languageForUnsupported(path);
			if (!miss) continue;
			const key = `${miss.language}\0${miss.engine ?? ''}`;
			if (!missingByKey.has(key)) missingByKey.set(key, miss);
		}
	}

	const loadable: EngineId[] = needsTypescript ? ['typescript'] : [];
	const missing = [...missingByKey.values()].sort((a, b) =>
		a.language.localeCompare(b.language),
	);
	return { loadable, missing };
}

/** True when the graph has at least one JS/TS source file. */
export function graphNeedsTypescript(graph: CodeGraph): boolean {
	return requiredEngines(graph).loadable.includes('typescript');
}
