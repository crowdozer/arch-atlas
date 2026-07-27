/**
 * Path omit globs for CLI host feeds (picomatch).
 * Matches relative POSIX paths (repo-root style), not absolute FS paths.
 */

import picomatch from 'picomatch';
import { normalizePath } from '@core/index.ts';

/**
 * Expand a user omit pattern into one or more picomatch globs.
 *
 * Bare names (no `/` or glob metacharacters) match that path segment anywhere:
 * `fixtures` expands to the segment, its descendants, and the same under `**`.
 *
 * Patterns that match a directory prefix also exclude descendants via
 * ancestor checks on the compiled matcher (so a fixtures-dir glob drops the tree).
 */
export function expandOmitPattern(raw: string): string[] {
	const t = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
	if (!t) return [];

	// Bare segment: fixtures, dist, __tests__
	if (!/[*?[\]]/.test(t) && !t.includes('/')) {
		return [t, `${t}/**`, `**/${t}`, `**/${t}/**`];
	}

	const out = [t];
	// `**/fixtures` does not match children; ancestor check covers that.
	// Still add explicit /** when pattern looks like a directory (no file-like suffix).
	if (!t.endsWith('/**') && !t.endsWith('*') && !/\.[a-zA-Z0-9]+$/.test(t)) {
		out.push(`${t}/**`);
	}
	return out;
}

export function expandOmitPatterns(patterns: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const p of patterns) {
		for (const e of expandOmitPattern(p)) {
			if (seen.has(e)) continue;
			seen.add(e);
			out.push(e);
		}
	}
	return out;
}

/**
 * Build a predicate: relative path should be omitted from the host feed.
 */
export function compileOmitMatcher(
	patterns: readonly string[],
): (relPath: string) => boolean {
	const expanded = expandOmitPatterns(patterns);
	if (expanded.length === 0) return () => false;

	const isMatch = picomatch(expanded, { dot: true });

	return (relPath: string): boolean => {
		const norm = normalizePath(relPath);
		if (!norm) return false;
		if (isMatch(norm)) return true;
		// If any ancestor directory matches, omit (whole subtree).
		const parts = norm.split('/');
		for (let i = 1; i < parts.length; i++) {
			if (isMatch(parts.slice(0, i).join('/'))) return true;
		}
		return false;
	};
}

/** Split CLI values: `--omit a --omit b` and `--omit=a,b`. */
export function parseOmitFlagValues(values: readonly string[]): string[] {
	const out: string[] = [];
	for (const v of values) {
		for (const part of v.split(',')) {
			const t = part.trim();
			if (t) out.push(t);
		}
	}
	return out;
}
