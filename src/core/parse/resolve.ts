/**
 * Level-1 specifier resolution against a file index.
 */

import { expandAlias, type PathAliasConfig, joinPosix } from '@core/parse/tsconfig.ts';

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', ''];

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

function tryFile(files: Set<string>, candidate: string): string | null {
	const normalized = candidate.replace(/^\//, '');
	if (files.has(normalized)) return normalized;
	for (const ext of SOURCE_EXTS) {
		if (ext && files.has(normalized + ext)) return normalized + ext;
	}
	// index.*
	for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
		const idx = joinPosix(normalized, `index${ext}`);
		if (files.has(idx)) return idx;
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
	return specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';
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

	// relative
	if (isRelativeSpecifier(specifier)) {
		const base = dirnamePosix(fromPath);
		const joined = joinPosix(base, specifier);
		const hit = tryFile(fileSet, joined);
		if (hit) return { kind: 'file', path: hit };
		return { kind: 'unresolved', specifier };
	}

	// path aliases
	const aliased = expandAlias(specifier, alias);
	for (const cand of aliased) {
		const hit = tryFile(fileSet, cand);
		if (hit) return { kind: 'file', path: hit };
	}

	// builtins
	const bare = barePackageName(specifier);
	if (NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(bare) || specifier.startsWith('node:')) {
		return { kind: 'package', name: specifier.startsWith('node:') ? specifier : bare, builtin: true };
	}

	// Path-like @/… is never a real npm scope (scopes are @name/pkg). When alias
	// expand failed, do not invent a fake package node such as "@/app".
	if (specifier.startsWith('@/')) {
		return { kind: 'unresolved', specifier };
	}

	// bare package
	if (!specifier.startsWith('.')) {
		return { kind: 'package', name: bare, builtin: false };
	}

	return { kind: 'unresolved', specifier };
}
