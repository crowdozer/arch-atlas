import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph, reachableFiles } from '@core/graph/build.ts';
import { buildMapCatalog } from '@core/catalog/views.ts';
import { projectAlluvial } from '@core/view/alluvial.ts';
import type { VirtualFile } from '@core/graph/types.ts';

const root = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures/sample-ts-project',
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
			out.push({ path: rel.replace(/\\/g, '/'), content, byteLength: content.length });
		}
	}
	return out;
}

describe('buildGraph fixture', () => {
	const files = loadFixtureDir(root);
	const graph = buildGraph(files);

	it('indexes source files and package.json deps', () => {
		expect(graph.stats.sourceCount).toBeGreaterThanOrEqual(7);
		expect(graph.packages.has('zod')).toBe(true);
		expect(graph.edges.length).toBeGreaterThan(5);
	});

	it('resolves relative imports to files', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'src/index.ts' && e.to === 'src/app.ts',
		);
		expect(edge?.toKind).toBe('file');
	});

	it('resolves path alias @/ from tsconfig', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'src/pages/home.ts' && e.to === 'src/lib/format.ts',
		);
		expect(edge?.toKind).toBe('file');
	});

	it('treats node builtins as packages', () => {
		const edge = graph.edges.find(
			(e) => e.from === 'src/db/users.ts' && e.specifier.includes('fs'),
		);
		expect(edge?.toKind).toBe('package');
		expect(edge?.to).toMatch(/fs/);
	});

	it('catalog ranks package main as start', () => {
		const catalog = buildMapCatalog(graph);
		expect(catalog.starts[0]?.path).toBe('src/index.ts');
		expect(catalog.ends.some((e) => e.label === 'zod')).toBe(true);
		expect(catalog.views.length).toBeGreaterThan(0);
	});

	it('projects alluvial from start (imports → file)', () => {
		const payload = projectAlluvial(graph, 'src/index.ts');
		expect(payload).not.toBeNull();
		expect(payload!.data.length).toBeGreaterThan(0);
		expect(payload!.options.alluvial.nodes.some((n) => n.category === 'File')).toBe(
			true,
		);
		expect(payload!.options.alluvial.nodes.some((n) => n.category === 'Modules')).toBe(
			false,
		);
		// links flow toward file (full path label), not outward from it
		const startPath = 'src/index.ts';
		const intoCode = payload!.data.some((l) => l.target === startPath);
		const outFromCode = payload!.data.some((l) => l.source === startPath);
		expect(intoCode).toBe(true);
		expect(outFromCode).toBe(false);
	});

	it('reachable files include app and routes', () => {
		const r = reachableFiles(graph, 'src/index.ts');
		expect(r.has('src/app.ts')).toBe(true);
		expect(r.has('src/routes/api.ts')).toBe(true);
	});
});

describe('buildGraph codebreaker-focus aliases', () => {
	const codebreakerRoot = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../fixtures/codebreaker-focus',
	);
	const files = loadFixtureDir(codebreakerRoot);
	const graph = buildGraph(files);

	it('does not invent a fake package node for @/app', () => {
		expect(graph.packages.has('@/app')).toBe(false);
		const packageEdges = graph.edges.filter(
			(e) => e.toKind === 'package' && e.to === '@/app',
		);
		expect(packageEdges).toHaveLength(0);
	});

	it('resolves @/app/components/ui to a file under app/components/ui', () => {
		const edge = graph.edges.find(
			(e) =>
				e.from === 'app/components/codebreaker/components/Buffer.tsx' &&
				e.specifier === '@/app/components/ui',
		);
		expect(edge).toBeDefined();
		expect(edge!.toKind).toBe('file');
		expect(edge!.to).toMatch(/^app\/components\/ui(\/|$)/);
	});
});
