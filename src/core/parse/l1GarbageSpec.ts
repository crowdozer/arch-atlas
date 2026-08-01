/**
 * L1 garbage-specifier grammar - **test invariant helper, not a production filter**.
 *
 * Used by adversarial suite tests after `buildGraph` to assert package names and
 * non-path-like unresolved specs are not extract false-positives (`|`, code soup,
 * empty junk, leftover `?`/`#` on package ids).
 *
 * Do **not** call from `build.ts` / `resolve.ts` / extract - real cure for FPs is
 * extract/resolve honesty; this module only asserts.
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';

/** Why a package/unresolved name failed the garbage grammar. */
export type GarbageReason =
	| 'empty'
	| 'pipe'
	| 'brackets-or-braces'
	| 'comma'
	| 'kind-soup'
	| 'quote-soup'
	| 'query-or-hash'
	| 'whitespace-in-id'
	| 'implausible-package'
	| 'unknown';

export type GarbageHit = {
	/** Edge from path, or packages-map key context */
	from: string;
	toKind: 'package' | 'unresolved' | 'packages-map';
	/** Package name or unresolved specifier under scrutiny */
	name: string;
	/** Original edge.specifier when from an edge */
	specifier?: string;
	reason: GarbageReason;
	detail?: string;
};

/**
 * Path-like unresolved specs are valid misses (relative/alias/tilde/python-dot),
 * not false packages - skip package-name grammar for these.
 */
export function isPathLikeUnresolvedSpecifier(spec: string): boolean {
	const s = spec.trim();
	if (!s) return false;
	// Relative / python leading-dot relatives (`.`, `..`, `./x`, `.foo`, `..pkg`)
	if (s === '.' || s === '..') return true;
	if (s.startsWith('./') || s.startsWith('../')) return true;
	if (s.startsWith('.')) return true;
	// Path-like alias prefixes (fail-closed or tilde when unresolved)
	if (s.startsWith('@/')) return true;
	if (s === '~' || s.startsWith('~/')) return true;
	return false;
}

/**
 * Hard denylist - known extract FP classes and pathological package ids.
 * Historic product classes: `|` (union form field), `[{ kind:` soup.
 */
export function isKnownGarbageSpecifier(spec: string): boolean {
	return garbageReason(spec) !== null;
}

/**
 * Soft allowlist for observed package / bare external names.
 * Covers npm-ish, scoped `@scope/pkg`, `node:*`, dotted npm (`lodash.debounce`),
 * and python top-level identifiers. Not a registry; intentionally permissive
 * within identifier-like shapes.
 */
export function isPlausiblePackageName(name: string): boolean {
	const s = name.trim();
	if (!s) return false;
	if (isKnownGarbageSpecifier(s)) return false;

	// node: builtins and subpaths (node:fs, node:fs/promises)
	if (s.startsWith('node:')) {
		const rest = s.slice('node:'.length);
		return rest.length > 0 && /^[A-Za-z0-9._\-/]+$/.test(rest);
	}

	// Scoped package: @scope/name (+ optional /subpath already reduced by barePackageName)
	if (s.startsWith('@')) {
		// barePackageName keeps @scope/pkg; allow optional further /segments if present
		return /^@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(s);
	}

	// Unscoped npm / python-ish: start alnum or _, then alnum, . _ - + :
	// (colon rare outside node: which is handled above)
	return /^[A-Za-z0-9_][A-Za-z0-9._+-]*$/.test(s);
}

/**
 * Classify a single name/spec against denylist. Returns null if not hard-garbage
 * (still may fail soft allowlist separately).
 */
export function garbageReason(spec: string): GarbageReason | null {
	if (spec.length === 0 || /^\s+$/.test(spec) || spec.trim() === '') {
		return 'empty';
	}
	const s = spec.trim();

	// Historic `|` package from form: 'import' | 'export' | …
	if (s === '|' || s.includes('|')) return 'pipe';

	// Code soup: brackets/braces
	if (/[\[\]{}]/.test(s)) return 'brackets-or-braces';

	// Comma-separated arg harvest
	if (s.includes(',')) return 'comma';

	// Self-scan push class: kind: 'side-effect' / kind:
	if (/kind\s*:/i.test(s)) return 'kind-soup';

	// Quote characters as package name soup
	if (/['"`]/.test(s)) return 'quote-soup';

	// Leftover tooling query/hash on package id (file edges may retain on specifier)
	if (s.includes('?') || s.includes('#')) return 'query-or-hash';

	// Internal whitespace (multi-token soup)
	if (/\s/.test(s)) return 'whitespace-in-id';

	return null;
}

function hitForName(
	from: string,
	toKind: GarbageHit['toKind'],
	name: string,
	specifier?: string,
): GarbageHit | null {
	const hard = garbageReason(name);
	if (hard) {
		return { from, toKind, name, specifier, reason: hard };
	}
	if (!isPlausiblePackageName(name)) {
		return {
			from,
			toKind,
			name,
			specifier,
			reason: 'implausible-package',
			detail: 'failed soft package-name allowlist',
		};
	}
	return null;
}

/**
 * Collect package/unresolved names that fail the garbage grammar.
 * - Skips `toKind === 'omitted'` and path-like unresolved
 * - For package edges, checks `edge.to` (package id)
 * - For non-path unresolved, checks `edge.to` then falls back to specifier bare
 * - Also walks `graph.packages` keys
 */
export function collectGarbageExternals(graph: CodeGraph): GarbageHit[] {
	const hits: GarbageHit[] = [];
	const seen = new Set<string>();

	const push = (h: GarbageHit) => {
		const key = `${h.toKind}\0${h.from}\0${h.name}\0${h.reason}`;
		if (seen.has(key)) return;
		seen.add(key);
		hits.push(h);
	};

	for (const edge of graph.edges) {
		if (edge.toKind === 'file' || edge.toKind === 'omitted') continue;

		if (edge.toKind === 'unresolved' && isPathLikeUnresolvedSpecifier(edge.to)) {
			continue;
		}
		// Also skip if path-like only visible on raw specifier (to may be cleaned)
		if (
			edge.toKind === 'unresolved' &&
			isPathLikeUnresolvedSpecifier(edge.specifier)
		) {
			continue;
		}

		const name =
			edge.toKind === 'package'
				? edge.to
				: edge.to || edge.specifier;

		const h = hitForName(edge.from, edge.toKind, name, edge.specifier);
		if (h) push(h);
	}

	for (const [pkgName] of graph.packages) {
		const h = hitForName('(packages)', 'packages-map', pkgName);
		if (h) push(h);
	}

	return hits;
}

/** Format hits for rich expect messages. */
export function formatGarbageHits(hits: GarbageHit[]): string {
	if (hits.length === 0) return '(none)';
	return hits
		.map(
			(h) =>
				`  - [${h.reason}] ${h.toKind} name=${JSON.stringify(h.name)}` +
				(h.specifier != null ? ` spec=${JSON.stringify(h.specifier)}` : '') +
				` from=${h.from}` +
				(h.detail ? ` (${h.detail})` : ''),
		)
		.join('\n');
}

/** Assert helper for tests - throws Error with listing when hits present. */
export function assertGraphNoGarbageExternal(graph: CodeGraph): void {
	const hits = collectGarbageExternals(graph);
	if (hits.length > 0) {
		throw new Error(
			`L1 garbage externals (${hits.length}):\n${formatGarbageHits(hits)}`,
		);
	}
}

/** Edge filter used by tests that only care about package/unresolved rows. */
export function externalEdges(graph: CodeGraph): ImportEdge[] {
	return graph.edges.filter(
		(e) => e.toKind === 'package' || e.toKind === 'unresolved',
	);
}
