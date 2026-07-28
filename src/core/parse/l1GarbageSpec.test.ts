/**
 * Unit tests for L1 garbage-specifier grammar (test invariant helper).
 * Covers historic `|` and `kind:` FP classes + legal package shapes.
 */
import { describe, expect, it } from 'vitest';
import {
	assertGraphNoGarbageExternal,
	collectGarbageExternals,
	garbageReason,
	isKnownGarbageSpecifier,
	isPathLikeUnresolvedSpecifier,
	isPlausiblePackageName,
} from '@core/parse/l1GarbageSpec.ts';
import type { CodeGraph, FileNode, ImportEdge, PackageNode } from '@core/graph/types.ts';

describe('isPathLikeUnresolvedSpecifier', () => {
	it('accepts relative and python leading-dot forms', () => {
		for (const s of [
			'.',
			'..',
			'./x',
			'../lib/a',
			'./missing.ts',
			'.sibling',
			'..pkg.sub',
			'.foo',
		]) {
			expect(isPathLikeUnresolvedSpecifier(s), s).toBe(true);
		}
	});

	it('accepts @/ and ~/ path-like prefixes', () => {
		expect(isPathLikeUnresolvedSpecifier('@/app/ui')).toBe(true);
		expect(isPathLikeUnresolvedSpecifier('~/lib')).toBe(true);
		expect(isPathLikeUnresolvedSpecifier('~')).toBe(true);
	});

	it('rejects bare packages and garbage', () => {
		for (const s of ['zod', 'react-dom', '@scope/pkg', '|', 'requests', 'node:fs']) {
			expect(isPathLikeUnresolvedSpecifier(s), s).toBe(false);
		}
	});
});

describe('isKnownGarbageSpecifier / garbageReason', () => {
	it('flags empty and whitespace', () => {
		expect(garbageReason('')).toBe('empty');
		expect(garbageReason('   ')).toBe('empty');
		expect(isKnownGarbageSpecifier('')).toBe(true);
	});

	it('flags historic | package class (union form field)', () => {
		expect(garbageReason('|')).toBe('pipe');
		expect(garbageReason("'import' | 'export'")).toBe('pipe');
		expect(isKnownGarbageSpecifier('|')).toBe(true);
	});

	it('flags brackets/braces/comma code soup', () => {
		expect(garbageReason('[{ kind:')).toBe('brackets-or-braces');
		expect(garbageReason('foo}')).toBe('brackets-or-braces');
		expect(garbageReason('a,b')).toBe('comma');
	});

	it('flags kind: self-scan soup class', () => {
		expect(garbageReason("kind: 'side-effect'")).toBe('kind-soup');
		expect(garbageReason('kind:')).toBe('kind-soup');
		expect(garbageReason('[{ kind:')).toBe('brackets-or-braces'); // brackets win first
	});

	it('flags quote soup and query/hash residue on package ids', () => {
		expect(garbageReason("'side-effect'")).toBe('quote-soup');
		expect(garbageReason('foo?worker')).toBe('query-or-hash');
		expect(garbageReason('?worker')).toBe('query-or-hash');
		expect(garbageReason('bar#hash')).toBe('query-or-hash');
	});

	it('flags internal whitespace', () => {
		expect(garbageReason('foo bar')).toBe('whitespace-in-id');
	});

	it('does not flag legal package shapes as hard garbage', () => {
		for (const s of [
			'zod',
			'react-dom',
			'ioredis',
			'lodash.debounce',
			'@carbon/charts',
			'@types/node',
			'node:fs',
			'node:fs/promises',
			'requests',
			'os',
		]) {
			expect(garbageReason(s), s).toBeNull();
			expect(isKnownGarbageSpecifier(s), s).toBe(false);
		}
	});
});

describe('isPlausiblePackageName', () => {
	it('accepts npm-ish, scoped, node:, python identifiers', () => {
		for (const s of [
			'zod',
			'react-dom',
			'ioredis',
			'lodash.debounce',
			'@carbon/charts',
			'@types/node',
			'@stripe/stripe-js',
			'node:fs',
			'node:fs/promises',
			'requests',
			'os',
			'_private',
			'prettier-plugin-tailwindcss',
		]) {
			expect(isPlausiblePackageName(s), s).toBe(true);
		}
	});

	it('rejects hard garbage and implausible shapes', () => {
		for (const s of [
			'',
			'|',
			'[{ kind:',
			"kind: 'side-effect'",
			'foo?worker',
			'./rel',
			'@/',
			'@scope', // scoped requires two segments
			'has space',
			"form: 'import'",
		]) {
			expect(isPlausiblePackageName(s), s).toBe(false);
		}
	});
});

function miniGraph(opts: {
	packages?: string[];
	edges?: Array<Pick<ImportEdge, 'from' | 'to' | 'toKind' | 'specifier'>>;
}): CodeGraph {
	const packages = new Map<string, PackageNode>();
	for (const name of opts.packages ?? []) {
		packages.set(name, {
			id: name,
			kind: 'package',
			name,
			source: 'import',
			epistemic: 'observed',
		});
	}
	const edges: ImportEdge[] = (opts.edges ?? []).map((e, i) => ({
		id: `e${i}`,
		kind: 'imports',
		from: e.from,
		to: e.to,
		toKind: e.toKind,
		specifier: e.specifier,
		epistemic: 'observed',
		form: 'import',
		line: 1,
		bindings: [{ kind: 'side-effect' }],
	}));
	const files = new Map<string, FileNode>();
	return {
		files,
		packages,
		edges,
		contents: new Map(),
		packageJsonPaths: [],
		parseMap: new Map(),
		stats: {
			fileCount: 0,
			sourceCount: 0,
			parseableCount: 0,
			unparseableCount: 0,
			edgeCount: edges.length,
			packageCount: packages.size,
			unresolvedCount: 0,
		},
	};
}

describe('collectGarbageExternals', () => {
	it('returns empty for clean packages and path-like unresolved', () => {
		const g = miniGraph({
			packages: ['zod', '@types/node', 'node:fs'],
			edges: [
				{ from: 'a.ts', to: 'zod', toKind: 'package', specifier: 'zod' },
				{
					from: 'a.ts',
					to: './missing',
					toKind: 'unresolved',
					specifier: './missing',
				},
				{
					from: 'a.ts',
					to: '@/nope',
					toKind: 'unresolved',
					specifier: '@/nope',
				},
			],
		});
		expect(collectGarbageExternals(g)).toEqual([]);
		expect(() => assertGraphNoGarbageExternal(g)).not.toThrow();
	});

	it('hits historic | package and kind soup', () => {
		const g = miniGraph({
			packages: ['|'],
			edges: [
				{ from: 'adv.ts', to: '|', toKind: 'package', specifier: '|' },
				{
					from: 'adv.ts',
					to: "[{ kind:",
					toKind: 'unresolved',
					specifier: "[{ kind:",
				},
			],
		});
		const hits = collectGarbageExternals(g);
		expect(hits.some((h) => h.name === '|' && h.reason === 'pipe')).toBe(true);
		expect(hits.some((h) => h.reason === 'brackets-or-braces')).toBe(true);
	});

	it('does not treat file-edge specifier retention as garbage', () => {
		// File edges are out of scope — only package/unresolved
		const g = miniGraph({
			edges: [
				{
					from: 'a.ts',
					to: 'src/w.ts',
					toKind: 'file',
					specifier: './w.ts?worker',
				},
			],
		});
		expect(collectGarbageExternals(g)).toEqual([]);
	});

	it('flags package name with ?worker residue', () => {
		const g = miniGraph({
			packages: ['foo?worker'],
			edges: [
				{
					from: 'a.ts',
					to: 'foo?worker',
					toKind: 'package',
					specifier: 'foo?worker',
				},
			],
		});
		const hits = collectGarbageExternals(g);
		expect(hits.some((h) => h.reason === 'query-or-hash')).toBe(true);
	});

	it('skips omitted edges', () => {
		const g = miniGraph({
			edges: [
				{
					from: 'a.ts',
					to: 'gone',
					toKind: 'omitted',
					specifier: './gone',
				},
			],
		});
		expect(collectGarbageExternals(g)).toEqual([]);
	});
});
