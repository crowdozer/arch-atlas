/**
 * Language-scoped path-resolution rule registry (estimate / Level-1 only).
 *
 * Not a LanguageFrontend plugin system and not Exact/LSP. Rules name the
 * ordered behaviors in `resolve.ts` so js-ts stays the sole enabled family
 * until extractors ship for others. `CANDIDATE_LANGUAGE_NOTES` is a docs seam
 * (not executed) for later transfer flagging.
 *
 * Follow-ups (not in this module's runtime): baseUrl-only bare (R10), package
 * `"imports"`, multi-tsconfig nearest, Vite/webpack alias readers.
 */

/** Estimate resolve language families. Only `js-ts` is enabled today. */
export type LanguageFamilyId = 'js-ts';

/**
 * Named path-rule families applied by `resolveSpecifier`.
 * Order in `RULES_BY_FAMILY` documents policy; apply order lives in resolve.ts.
 */
export type PathRuleFamily =
	| 'dot-relative'
	| 'ext-index-probe'
	| 'config-path-alias'
	| 'pathlike-at-fail-closed'
	| 'bare-external'
	| 'tilde-prefix'
	| 'specifier-ext-rewrite';

/** Rules enabled for estimate resolve today (js-ts only). */
export const RULES_BY_FAMILY: Record<LanguageFamilyId, readonly PathRuleFamily[]> = {
	'js-ts': [
		'dot-relative',
		'ext-index-probe', // part of tryFile
		'config-path-alias',
		'pathlike-at-fail-closed',
		'tilde-prefix',
		'specifier-ext-rewrite',
		'bare-external',
	],
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
			'dot-relative',
			'ext-index-probe',
			'config-path-alias',
			'pathlike-at-fail-closed',
			'tilde-prefix',
			'specifier-ext-rewrite',
			'bare-external',
		],
		confidence: 'very-high',
		blockers: ['same gaps as js-ts (bundler configs, package imports)'],
	},
	{
		family: 'vue-svelte-astro-sfc',
		rules: [
			'dot-relative',
			'ext-index-probe',
			'config-path-alias',
			'pathlike-at-fail-closed',
			'bare-external',
		],
		confidence: 'medium',
		blockers: ['SFC script-block extract', 'style/template import paths'],
	},
	{
		family: 'php-composer',
		rules: ['config-path-alias', 'dot-relative'],
		confidence: 'medium',
		blockers: ['use/require extract', 'PSR-4 map loader', 'not npm bare'],
	},
	{
		family: 'python',
		rules: ['bare-external'],
		confidence: 'low-medium',
		blockers: ['import extract', 'package-relative layout', '__init__.py probe'],
	},
	{
		family: 'go',
		rules: ['bare-external'],
		confidence: 'low',
		blockers: ['go.mod modules', 'module-path imports ≠ file-relative ./'],
	},
	{
		family: 'rust',
		rules: ['bare-external'],
		confidence: 'low',
		blockers: ['mod/use path model', 'crate graph'],
	},
	{
		family: 'java-kotlin',
		rules: ['bare-external'],
		confidence: 'low',
		blockers: ['type-name imports', 'classpath layout'],
	},
];

/** JS/TS source extensions used for family detection (mirrors isSourceFile). */
const JS_TS_SOURCE_EXT = /\.(m?[jt]sx?|cjs|mjs)$/i;

/**
 * Derive language family from importer path. Returns null when no estimate
 * resolve family is registered (unsupported languages never reach resolve today).
 */
export function familyForPath(path: string): LanguageFamilyId | null {
	if (JS_TS_SOURCE_EXT.test(path)) return 'js-ts';
	return null;
}

/** Whether `family` enables a given rule family. */
export function familyHasRule(
	family: LanguageFamilyId,
	rule: PathRuleFamily,
): boolean {
	return RULES_BY_FAMILY[family].includes(rule);
}
