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

/** Probe extensions for js-ts tryFile (ext-index-probe). Includes Astro SFCs. */
const SOURCE_EXTS = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.mts',
	'.cts',
	'.astro',
	'',
] as const;

/** Index basenames under a directory candidate. */
const INDEX_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.astro'] as const;

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

/**
 * Strip Vite/webpack resource query and hash before tryFile / bare parse.
 * e.g. `../exact/program.worker.ts?worker` → `../exact/program.worker.ts`
 * Cuts at the first `?` or `#` (path?query#hash).
 */
export function stripSpecifierResourceSuffix(specifier: string): string {
	const q = specifier.indexOf('?');
	const h = specifier.indexOf('#');
	let cut = -1;
	if (q !== -1 && h !== -1) cut = Math.min(q, h);
	else if (q !== -1) cut = q;
	else if (h !== -1) cut = h;
	return cut === -1 ? specifier : specifier.slice(0, cut);
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

/**
 * Probe `mod.py` then `mod/__init__.py` (never invents paths outside fileSet).
 */
function tryPythonModule(files: Set<string>, modulePath: string): string | null {
	const normalized = modulePath.replace(/^\//, '').replace(/\/$/, '');
	if (!normalized) return null;
	const py = `${normalized}.py`;
	if (files.has(py)) return py;
	const init = joinPosix(normalized, '__init__.py');
	if (files.has(init)) return init;
	return null;
}

/** Top-level package segment (`a.b.c` → `a`, `requests` → `requests`). */
function pythonTopLevel(specifier: string): string {
	const stripped = specifier.replace(/^\.+/, '');
	return stripped.split('.')[0] || specifier;
}

/**
 * Python Level-1 resolve: dotted modules, leading-dot relatives, bare → package.
 */
function resolvePythonSpecifier(
	fromPath: string,
	specifier: string,
	fileSet: Set<string>,
): ResolveResult {
	// Leading-dot relative: `.`, `..`, `.foo`, `..pkg.sub`
	if (specifier.startsWith('.')) {
		let level = 0;
		while (level < specifier.length && specifier[level] === '.') level++;
		const rest = specifier.slice(level); // may be empty or "foo.bar"

		let dir = dirnamePosix(fromPath);
		// level=1 → current package dir; level=2 → parent; …
		for (let u = 0; u < level - 1; u++) {
			dir = dirnamePosix(dir);
		}

		if (!rest) {
			// Bare dots → package __init__.py when present
			const init = dir ? joinPosix(dir, '__init__.py') : '__init__.py';
			if (fileSet.has(init)) return { kind: 'file', path: init };
			return { kind: 'unresolved', specifier };
		}

		const parts = rest.split('.').filter(Boolean);
		let joined = dir;
		for (const p of parts) {
			joined = joinPosix(joined, p);
		}
		const hit = tryPythonModule(fileSet, joined);
		if (hit) return { kind: 'file', path: hit };
		// Relative miss stays unresolved (do not invent external from `.foo`)
		return { kind: 'unresolved', specifier };
	}

	// Absolute / bare dotted: try repo-root layout, then package node
	const parts = specifier.split('.').filter(Boolean);
	if (parts.length === 0) {
		return { kind: 'unresolved', specifier };
	}
	const asPath = parts.join('/');
	const hit = tryPythonModule(fileSet, asPath);
	if (hit) return { kind: 'file', path: hit };

	// Also try under the importer's ancestral package roots (implicit namespace)
	let dir = dirnamePosix(fromPath);
	while (dir) {
		const candidate = joinPosix(dir, asPath);
		const nested = tryPythonModule(fileSet, candidate);
		if (nested) return { kind: 'file', path: nested };
		const parent = dirnamePosix(dir);
		if (parent === dir) break;
		dir = parent;
	}

	// Unresolved bare → external package leaf (stdlib / third-party honesty)
	return {
		kind: 'package',
		name: pythonTopLevel(specifier),
		builtin: false,
	};
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

	// Family from importer path. Default js-ts for synthetic paths in unit tests.
	const family: LanguageFamilyId = familyForPath(fromPath) ?? 'js-ts';

	if (family === 'python') {
		return resolvePythonSpecifier(fromPath, specifier, fileSet);
	}

	// Vite/webpack resource queries (`?worker`, `?raw`, …) and optional hash
	const cleaned = stripSpecifierResourceSuffix(specifier);
	if (!cleaned) {
		return { kind: 'unresolved', specifier: cleaned || specifier };
	}

	const rewriteExt = hasRule(family, 'specifier-ext-rewrite');
	const tryOpts = { rewriteExt };

	// R1: dot-relative
	if (hasRule(family, 'dot-relative') && isRelativeSpecifier(cleaned)) {
		const base = dirnamePosix(fromPath);
		const joined = joinPosix(base, cleaned);
		const hit = tryFile(fileSet, joined, tryOpts);
		if (hit) return { kind: 'file', path: hit };
		return { kind: 'unresolved', specifier: cleaned };
	}

	// R6: ~/ → baseUrl/root join + tryFile; miss → unresolved (never package ~)
	if (hasRule(family, 'tilde-prefix') && isTildeSpecifier(cleaned)) {
		const rest = cleaned === '~' ? '' : cleaned.slice(2);
		const joined = joinPosix(tildeBase(alias), rest);
		const hit = tryFile(fileSet, joined, tryOpts);
		if (hit) return { kind: 'file', path: hit };
		return { kind: 'unresolved', specifier: cleaned };
	}

	// R3: config path aliases (tsconfig/jsconfig)
	if (hasRule(family, 'config-path-alias')) {
		const aliased = expandAlias(cleaned, alias);
		for (const cand of aliased) {
			const hit = tryFile(fileSet, cand, tryOpts);
			if (hit) return { kind: 'file', path: hit };
		}
	}

	// builtins (bare-external subset)
	const bare = barePackageName(cleaned);
	if (
		hasRule(family, 'bare-external') &&
		(NODE_BUILTINS.has(cleaned) || NODE_BUILTINS.has(bare) || cleaned.startsWith('node:'))
	) {
		return {
			kind: 'package',
			name: cleaned.startsWith('node:') ? cleaned : bare,
			builtin: true,
		};
	}

	// R4: path-like @/… is never a real npm scope (scopes are @name/pkg).
	if (hasRule(family, 'pathlike-at-fail-closed') && cleaned.startsWith('@/')) {
		return { kind: 'unresolved', specifier: cleaned };
	}

	// R5: bare package
	if (hasRule(family, 'bare-external') && !cleaned.startsWith('.')) {
		return { kind: 'package', name: bare, builtin: false };
	}

	return { kind: 'unresolved', specifier: cleaned };
}
