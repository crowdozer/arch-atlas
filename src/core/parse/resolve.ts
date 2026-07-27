/**
 * Level-1 specifier resolution against a file index (estimate topology only).
 *
 * Policy (language-scoped rule IDs) lives in `resolveRules.ts`. Exact/LSP is
 * a separate surface; this module never invents files outside `fileSet`.
 */

import { expandAlias, type PathAliasConfig, joinPosix } from '@core/parse/tsconfig.ts';
import {
	familyForPath,
	familyHasRule,
	type LanguageFamilyId,
	type PathRuleFamily,
} from '@core/parse/resolveRules.ts';

/** Probe extensions for js-ts tryFile (ext-index-probe). */
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', ''] as const;

/** Index basenames under a directory candidate. */
const INDEX_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/**
 * Specifier/path tails eligible for TS ESM rewrite (specifier-ext-rewrite).
 * When `foo.js` misses, probe `foo.ts` / `foo.tsx` / … if present in fileSet.
 */
const REWRITE_FROM_EXTS = ['.js', '.mjs', '.cjs', '.jsx'] as const;
const REWRITE_TO_EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

const NODE_BUILTINS = new Set([
	'assert',
	'buffer',
	'child_process',
	'cluster',
	'crypto',
	'dgram',
	'dns',
	'events',
	'fs',
	'fs/promises',
	'http',
	'https',
	'module',
	'net',
	'os',
	'path',
	'path/posix',
	'path/win32',
	'perf_hooks',
	'process',
	'querystring',
	'readline',
	'stream',
	'string_decoder',
	'timers',
	'tls',
	'tty',
	'url',
	'util',
	'v8',
	'vm',
	'worker_threads',
	'zlib',
	'node:assert',
	'node:buffer',
	'node:child_process',
	'node:cluster',
	'node:crypto',
	'node:dgram',
	'node:dns',
	'node:events',
	'node:fs',
	'node:fs/promises',
	'node:http',
	'node:https',
	'node:module',
	'node:net',
	'node:os',
	'node:path',
	'node:process',
	'node:stream',
	'node:timers',
	'node:tls',
	'node:url',
	'node:util',
	'node:worker_threads',
	'node:zlib',
]);

export type ResolveResult =
	| { kind: 'file'; path: string }
	| { kind: 'package'; name: string; builtin: boolean }
	| { kind: 'unresolved'; specifier: string };

function dirnamePosix(path: string): string {
	const i = path.lastIndexOf('/');
	if (i <= 0) return '';
	return path.slice(0, i);
}

function stripRewriteExt(path: string): string | null {
	const lower = path.toLowerCase();
	for (const ext of REWRITE_FROM_EXTS) {
		if (lower.endsWith(ext)) return path.slice(0, path.length - ext.length);
	}
	return null;
}

/**
 * tryFile + optional specifier-ext-rewrite.
 * Never invents paths outside `files`.
 */
function tryFile(
	files: Set<string>,
	candidate: string,
	opts: { rewriteExt: boolean },
): string | null {
	const normalized = candidate.replace(/^\//, '');
	if (files.has(normalized)) return normalized;
	for (const ext of SOURCE_EXTS) {
		if (ext && files.has(normalized + ext)) return normalized + ext;
	}
	// index.*
	for (const ext of INDEX_EXTS) {
		const idx = joinPosix(normalized, `index${ext}`);
		if (files.has(idx)) return idx;
	}

	// TS ESM: import './foo.js' when only foo.ts exists
	if (opts.rewriteExt) {
		const stripped = stripRewriteExt(normalized);
		if (stripped !== null) {
			for (const ext of REWRITE_TO_EXTS) {
				if (files.has(stripped + ext)) return stripped + ext;
			}
			for (const ext of REWRITE_TO_EXTS) {
				const idx = joinPosix(stripped, `index${ext}`);
				if (files.has(idx)) return idx;
			}
		}
	}
	return null;
}

/** Bare package name from specifier (`@scope/pkg/sub` → `@scope/pkg`). */
export function barePackageName(specifier: string): string {
	if (specifier.startsWith('node:')) return specifier;
	if (specifier.startsWith('@')) {
		const parts = specifier.split('/');
		return parts.slice(0, 2).join('/');
	}
	return specifier.split('/')[0] ?? specifier;
}

export function isRelativeSpecifier(specifier: string): boolean {
	return (
		specifier.startsWith('./') ||
		specifier.startsWith('../') ||
		specifier === '.' ||
		specifier === '..'
	);
}

function isTildeSpecifier(specifier: string): boolean {
	return specifier === '~' || specifier.startsWith('~/');
}

/** Root for `~/` join: alias baseUrl when set, else virtual file-set root. */
function tildeBase(alias: PathAliasConfig | null): string {
	const base = alias?.baseUrl;
	if (!base || base === '.' || base === './') return '';
	return base;
}

function hasRule(family: LanguageFamilyId | null, rule: PathRuleFamily): boolean {
	if (!family) return false;
	return familyHasRule(family, rule);
}

export function resolveSpecifier(
	fromPath: string,
	specifier: string,
	fileSet: Set<string>,
	alias: PathAliasConfig | null,
): ResolveResult {
	if (!specifier || specifier.startsWith('data:') || specifier.startsWith('http')) {
		return { kind: 'unresolved', specifier };
	}

	// Importers are always js-ts today (only import-parseable family). Default
	// to js-ts when path is unknown so unit tests with synthetic paths still work.
	const family: LanguageFamilyId = familyForPath(fromPath) ?? 'js-ts';
	const rewriteExt = hasRule(family, 'specifier-ext-rewrite');
	const tryOpts = { rewriteExt };

	// R1: dot-relative
	if (hasRule(family, 'dot-relative') && isRelativeSpecifier(specifier)) {
		const base = dirnamePosix(fromPath);
		const joined = joinPosix(base, specifier);
		const hit = tryFile(fileSet, joined, tryOpts);
		if (hit) return { kind: 'file', path: hit };
		return { kind: 'unresolved', specifier };
	}

	// R6: ~/ → baseUrl/root join + tryFile; miss → unresolved (never package ~)
	if (hasRule(family, 'tilde-prefix') && isTildeSpecifier(specifier)) {
		const rest = specifier === '~' ? '' : specifier.slice(2);
		const joined = joinPosix(tildeBase(alias), rest);
		const hit = tryFile(fileSet, joined, tryOpts);
		if (hit) return { kind: 'file', path: hit };
		return { kind: 'unresolved', specifier };
	}

	// R3: config path aliases (tsconfig/jsconfig)
	if (hasRule(family, 'config-path-alias')) {
		const aliased = expandAlias(specifier, alias);
		for (const cand of aliased) {
			const hit = tryFile(fileSet, cand, tryOpts);
			if (hit) return { kind: 'file', path: hit };
		}
	}

	// builtins (bare-external subset)
	const bare = barePackageName(specifier);
	if (
		hasRule(family, 'bare-external') &&
		(NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(bare) || specifier.startsWith('node:'))
	) {
		return {
			kind: 'package',
			name: specifier.startsWith('node:') ? specifier : bare,
			builtin: true,
		};
	}

	// R4: path-like @/… is never a real npm scope (scopes are @name/pkg).
	if (hasRule(family, 'pathlike-at-fail-closed') && specifier.startsWith('@/')) {
		return { kind: 'unresolved', specifier };
	}

	// R5: bare package
	if (hasRule(family, 'bare-external') && !specifier.startsWith('.')) {
		return { kind: 'package', name: bare, builtin: false };
	}

	return { kind: 'unresolved', specifier };
}
