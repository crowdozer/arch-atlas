/**
 * Language-scoped path-resolution rule registry (estimate / Level-1 only).
 *
 * Not a LanguageFrontend plugin system and not Exact/LSP. Rules name the
 * ordered behaviors in `resolve.ts`. Enabled families: `js-ts`, `python`.
 * `CANDIDATE_LANGUAGE_NOTES` is a docs seam (not executed) for later transfer
 * flagging.
 *
 * Follow-ups (not in this module's runtime): baseUrl-only bare (R10), package
 * `"imports"`, multi-tsconfig nearest, Vite/webpack alias readers.
 */

/** Estimate resolve language families with extractors + resolve policy. */
export type LanguageFamilyId = 'js-ts' | 'python';

/**
 * Named path-rule families applied by `resolveSpecifier`.
 * Order in `RULES_BY_FAMILY` documents policy; apply order lives in resolve.ts.
 *
 * `resource-query-strip` is a **js-ts pre-resolve normalize** (Vite/webpack
 * `?worker` / `?raw` / `#hash`). Not universal — candidates must not inherit
 * it blindly (see CANDIDATE_LANGUAGE_NOTES blockers).
 */
export type PathRuleFamily =
	| 'dot-relative'
	| 'ext-index-probe'
	| 'config-path-alias'
	| 'pathlike-at-fail-closed'
	| 'bare-external'
	| 'tilde-prefix'
	| 'specifier-ext-rewrite'
	/** js-ts only: strip `?query` / `#hash` before tryFile (not python). */
	| 'resource-query-strip';

/** Rules enabled for estimate resolve (family-scoped apply in resolve.ts). */
export const RULES_BY_FAMILY: Record<LanguageFamilyId, readonly PathRuleFamily[]> = {
	'js-ts': [
		'resource-query-strip', // pre-step; Vite/webpack only
		'dot-relative',
		'ext-index-probe', // part of tryFile
		'config-path-alias',
		'pathlike-at-fail-closed',
		'tilde-prefix',
		'specifier-ext-rewrite',
		'bare-external',
	],
	/** Package-relative dots + `.py`/`__init__.py` probe; bare → external package. */
	python: ['dot-relative', 'ext-index-probe', 'bare-external'],
};

export type CandidateLanguageNote = {
	family: string;
	/** PathRuleFamily ids that could transfer with few alterations. */
	rules: readonly PathRuleFamily[];
	confidence: 'very-high' | 'high' | 'medium' | 'low-medium' | 'low';
	blockers: readonly string[];
};

/**
 * Candidate transfer notes (not executed). Later extractors can opt in.
 * PHP: alias-map shape; Python/Go/Rust/Java: need extract first.
 */
export const CANDIDATE_LANGUAGE_NOTES: readonly CandidateLanguageNote[] = [
	{
		family: 'javascript',
		rules: [
			'resource-query-strip',
			'dot-relative',
			'ext-index-probe',
			'config-path-alias',
			'pathlike-at-fail-closed',
			'tilde-prefix',
			'specifier-ext-rewrite',
			'bare-external',
		],
		confidence: 'very-high',
		blockers: [
			'same gaps as js-ts (bundler configs, package imports)',
			// document only — already enabled for js-ts family
			'bundler query strip is js-ts pre-resolve normalize, not universal',
		],
	},
	{
		family: 'vue-svelte-astro-sfc',
		rules: [
			'resource-query-strip', // only if resolve family stays js-ts (Astro does)
			'dot-relative',
			'ext-index-probe',
			'config-path-alias',
			'pathlike-at-fail-closed',
			'bare-external',
		],
		confidence: 'medium',
		blockers: [
			'SFC script-block extract',
			'style/template import paths',
			'string-aware extract FP suite required (HTML lookalikes)',
			'bundler query strip is js-ts pre-resolve normalize, not universal',
		],
	},
	{
		family: 'php-composer',
		rules: ['config-path-alias', 'dot-relative'],
		confidence: 'medium',
		blockers: [
			'use/require extract',
			'PSR-4 map loader',
			'not npm bare',
			'do not inherit resource-query-strip (not a bundler family)',
			'string-aware extract FP suite required',
		],
	},
	{
		family: 'python',
		rules: ['dot-relative', 'ext-index-probe', 'bare-external'],
		confidence: 'high',
		blockers: [
			'no site-packages / pyproject path maps',
			'no importlib / dynamic',
			'stdlib builtin tagging optional',
			// resource-query-strip intentionally absent — python early-return in resolve.ts
			'bundler query strip is js-ts pre-resolve normalize, not universal',
		],
	},
	{
		family: 'go',
		rules: ['bare-external'],
		confidence: 'low',
		blockers: [
			'go.mod modules',
			'module-path imports ≠ file-relative ./',
			'do not inherit resource-query-strip',
		],
	},
	{
		family: 'rust',
		rules: ['bare-external'],
		confidence: 'low',
		blockers: ['mod/use path model', 'crate graph', 'do not inherit resource-query-strip'],
	},
	{
		family: 'java-kotlin',
		rules: ['bare-external'],
		confidence: 'low',
		blockers: [
			'type-name imports',
			'classpath layout',
			'do not inherit resource-query-strip',
		],
	},
];

/** JS/TS source extensions used for family detection (mirrors isSourceFile). */
const JS_TS_SOURCE_EXT = /\.(m?[jt]sx?|cjs|mjs)$/i;

/** Python source extension (mirrors isPythonSourceFile). */
const PYTHON_SOURCE_EXT = /\.py$/i;

/** Astro SFCs resolve like JS/TS (script-island imports). */
const ASTRO_SOURCE_EXT = /\.astro$/i;

/**
 * Derive language family from importer path. Returns null when no estimate
 * resolve family is registered (unsupported languages never reach resolve today).
 */
export function familyForPath(path: string): LanguageFamilyId | null {
	if (JS_TS_SOURCE_EXT.test(path)) return 'js-ts';
	if (ASTRO_SOURCE_EXT.test(path)) return 'js-ts';
	if (PYTHON_SOURCE_EXT.test(path)) return 'python';
	return null;
}

/** Whether `family` enables a given rule family. */
export function familyHasRule(
	family: LanguageFamilyId,
	rule: PathRuleFamily,
): boolean {
	return RULES_BY_FAMILY[family].includes(rule);
}
