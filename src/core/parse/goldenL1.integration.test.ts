/**
 * Product-agnostic L1 disk goldens - extract → resolve → edge laws.
 *
 * Source of truth for minimal multi-lang L1 honesty. Not hub/alluvial/demo.
 * See fixtures/golden-l1-* and .grok/reference/language-landing-l1.md.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import type { VirtualFile } from '@core/graph/types.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function loadFixtureDir(dir: string, prefix = ''): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const rel = prefix ? `${prefix}/${name}` : name;
		if (statSync(full).isDirectory()) {
			out.push(...loadFixtureDir(full, rel));
		} else {
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel.replace(/\\/g, '/'),
				content,
				byteLength: content.length,
			});
		}
	}
	return out;
}

function edgeSpecsFrom(graph: ReturnType<typeof buildGraph>, from: string): string[] {
	return graph.edges.filter((e) => e.from === from).map((e) => e.specifier);
}

describe('golden-l1-js-ts', () => {
	const files = loadFixtureDir(path.join(fixturesRoot, 'golden-l1-js-ts'));
	const graph = buildGraph(files);

	it('indexes sources with js-ts-import parseKind', () => {
		expect(graph.files.get('src/entry.ts')?.isSource).toBe(true);
		expect(graph.files.get('src/entry.ts')?.parseKind).toBe('js-ts-import');
		expect(graph.files.get('src/adversarial.ts')?.parseKind).toBe('js-ts-import');
	});

	it('resolves relative import entry → util', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'src/entry.ts' && e.to === 'src/lib/util.ts',
		);
		expect(edge?.toKind).toBe('file');
	});

	it('resolves package zod from entry', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'src/entry.ts' && e.specifier === 'zod',
		);
		expect(edge?.toKind).toBe('package');
		expect(edge?.to).toBe('zod');
		expect(graph.packages.has('zod')).toBe(true);
	});

	it('strips ?worker and resolves worker target as file', () => {
		const edge = graph.edges.find(
			(e) =>
				e.from === 'src/entry.ts' &&
				e.to === 'src/lib/worker-target.ts',
		);
		expect(edge?.toKind).toBe('file');
		// Specifier may retain query in edge record or be cleaned - target path is law
		const specs = edgeSpecsFrom(graph, 'src/entry.ts');
		expect(
			specs.some(
				(s) =>
					s.includes('worker-target') ||
					s === './lib/worker-target.ts?worker',
			),
		).toBe(true);
		// Never paint bare '|' as package from adversarial lookalikes
		expect(graph.packages.has('|')).toBe(false);
	});

	it('resolves tsconfig @/* alias from pages/home', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'src/pages/home.ts' && e.to === 'src/lib/util.ts',
		);
		expect(edge?.toKind).toBe('file');
		expect(edge?.specifier).toMatch(/^@\//);
	});

	it('adversarial.ts has real util edge and no | / fake / commented packages', () => {
		const fromAdv = graph.edges.filter((e) => e.from === 'src/adversarial.ts');
		expect(fromAdv.some((e) => e.to === 'src/lib/util.ts' && e.toKind === 'file')).toBe(
			true,
		);
		const specs = fromAdv.map((e) => e.specifier);
		expect(specs).not.toContain('|');
		expect(specs).not.toContain('export');
		expect(specs).not.toContain('./fake');
		expect(specs).not.toContain('./commented');
		expect(specs).not.toContain('./block');
		expect(graph.packages.has('|')).toBe(false);
	});
});

describe('golden-l1-python', () => {
	const files = loadFixtureDir(path.join(fixturesRoot, 'golden-l1-python'));
	const graph = buildGraph(files);

	it('indexes Python sources as python-import', () => {
		expect(graph.files.get('pkg/a.py')?.isSource).toBe(true);
		expect(graph.files.get('pkg/a.py')?.parseKind).toBe('python-import');
		expect(graph.files.get('adversarial.py')?.parseKind).toBe('python-import');
	});

	it('resolves relative and absolute package file edges', () => {
		expect(
			graph.edges.some(
				(e) => e.from === 'main.py' && e.to === 'pkg/a.py' && e.toKind === 'file',
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(e) => e.from === 'pkg/a.py' && e.to === 'pkg/b.py' && e.toKind === 'file',
			),
		).toBe(true);
	});

	it('maps bare external requests to package node', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'pkg/a.py' && e.specifier === 'requests',
		);
		expect(edge?.toKind).toBe('package');
		expect(edge?.to).toBe('requests');
		expect(graph.packages.has('requests')).toBe(true);
	});

	it('adversarial.py real pkg.a edge; no comment/triple-quote phantoms', () => {
		const fromAdv = graph.edges.filter((e) => e.from === 'adversarial.py');
		expect(
			fromAdv.some((e) => e.to === 'pkg/a.py' && e.toKind === 'file'),
		).toBe(true);
		const specs = fromAdv.map((e) => e.specifier);
		expect(specs).not.toContain('commented_out');
		expect(specs).not.toContain('fake');
		expect(specs).not.toContain('not_real');
		expect(specs).not.toContain('nowhere');
	});
});

describe('golden-l1-astro', () => {
	const files = loadFixtureDir(path.join(fixturesRoot, 'golden-l1-astro'));
	const graph = buildGraph(files);

	it('classifies .astro as astro-import; .ts as js-ts-import', () => {
		expect(graph.files.get('src/pages/index.astro')?.parseKind).toBe('astro-import');
		expect(graph.files.get('src/lib/greet.ts')?.parseKind).toBe('js-ts-import');
	});

	it('index.astro frontmatter edges to Layout.astro and greet.ts', () => {
		const fromPage = graph.edges.filter((e) => e.from === 'src/pages/index.astro');
		expect(
			fromPage.some((e) => e.to === 'src/layouts/Layout.astro' && e.toKind === 'file'),
		).toBe(true);
		expect(
			fromPage.some((e) => e.to === 'src/lib/greet.ts' && e.toKind === 'file'),
		).toBe(true);
	});

	it('noisy.astro keeps real islands; HTML lookalikes are not edges', () => {
		const fromNoisy = graph.edges.filter((e) => e.from === 'src/pages/noisy.astro');
		expect(
			fromNoisy.some((e) => e.to === 'src/layouts/Layout.astro' && e.toKind === 'file'),
		).toBe(true);
		expect(
			fromNoisy.some((e) => e.to === 'src/lib/greet.ts' && e.toKind === 'file'),
		).toBe(true);
		const specs = fromNoisy.map((e) => e.specifier);
		expect(specs).not.toContain('./fake');
		expect(specs).not.toContain('./Button.astro');
		expect(specs).not.toContain('../ghost.ts');
		// No unresolved phantoms from HTML
		const badTargets = fromNoisy.filter(
			(e) =>
				e.to.includes('fake') ||
				e.to.includes('ghost') ||
				e.to.includes('Button'),
		);
		expect(badTargets).toHaveLength(0);
	});
});
