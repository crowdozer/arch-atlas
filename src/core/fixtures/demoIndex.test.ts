/**
 * Index built-in demo fixture trees from disk (same files the UI loads).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexFiles, projectFileHub } from '@core/index.ts';
import type { VirtualFile } from '@core/graph/types.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures');

function walkFiles(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) {
			out.push(...walkFiles(full, base));
			continue;
		}
		const rel = path.relative(base, full).split(path.sep).join('/');
		const content = readFileSync(full, 'utf8');
		out.push({ path: rel, content, byteLength: Buffer.byteLength(content) });
	}
	return out;
}

describe('demo fixtures index', () => {
	it('react-simple yields starts, edges, packages', () => {
		const files = walkFiles(path.join(root, 'demo-react-simple'));
		expect(files.length).toBeGreaterThan(8);
		const { graph, catalog } = indexFiles(files);
		expect(graph.stats.sourceCount).toBeGreaterThan(5);
		expect(graph.stats.edgeCount).toBeGreaterThan(5);
		expect(catalog.starts.some((s) => s.path.includes('main.tsx'))).toBe(true);
		expect(catalog.ends.some((e) => e.label === 'react' || e.label === 'zod')).toBe(true);
	});

	it('next-complex yields dense graph with multiple surfaces', () => {
		const files = walkFiles(path.join(root, 'demo-next-complex'));
		expect(files.length).toBeGreaterThan(25);
		const { graph, catalog } = indexFiles(files);
		expect(graph.stats.sourceCount).toBeGreaterThan(20);
		expect(graph.stats.edgeCount).toBeGreaterThan(30);
		expect(graph.files.has('middleware.ts') || graph.files.has('app/page.tsx')).toBe(true);
		expect(catalog.starts.length).toBeGreaterThan(0);
		// external sinks from package graph
		const labels = new Set(catalog.ends.map((e) => e.label));
		expect(
			labels.has('next') || labels.has('stripe') || labels.has('pg') || labels.has('ioredis'),
		).toBe(true);
	});

	it('spaghetti-godfile yields blast radius and dense reverse chains', () => {
		const files = walkFiles(path.join(root, 'demo-spaghetti-godfile'));
		expect(files.length).toBeGreaterThan(15);
		const { graph, catalog } = indexFiles(files);
		expect(graph.stats.sourceCount).toBeGreaterThan(15);
		expect(graph.stats.edgeCount).toBeGreaterThan(20);
		expect(graph.files.has('src/god/hub.ts')).toBe(true);

		// Blast radius: reverse consumers exist (domain/money, chain leaf, etc.)
		expect(catalog.blastRadius.length).toBeGreaterThan(0);
		expect(catalog.blastRadius[0]!.reverseReachFiles).toBeGreaterThan(0);
		expect(catalog.blastRadius.every((b) => b.epistemic === 'observed')).toBe(true);
	});

	it('python-app yields Python import graph with external packages', () => {
		const files = walkFiles(path.join(root, 'demo-python-app'));
		expect(files.length).toBeGreaterThan(10);
		const { graph, catalog } = indexFiles(files);
		expect(graph.stats.sourceCount).toBeGreaterThan(8);
		expect(graph.stats.edgeCount).toBeGreaterThan(8);
		expect(catalog.summary.languages).toContain('Python');
		expect(graph.files.has('app/main.py')).toBe(true);
		expect(graph.files.has('app/api/routes.py')).toBe(true);
		// File-to-file edges from absolute package imports
		const fileEdges = graph.edges.filter((e) => e.toKind === 'file');
		expect(fileEdges.length).toBeGreaterThan(5);
		const pkgNames = new Set(
			[...graph.packages.values()].map((p) => p.name),
		);
		expect(
			pkgNames.has('flask') ||
				pkgNames.has('requests') ||
				pkgNames.has('sqlalchemy'),
		).toBe(true);

		// Default start must be hub-openable (not edge-less app/__init__.py)
		const first = catalog.starts[0];
		expect(first).toBeDefined();
		expect(first!.path).not.toBe('app/__init__.py');
		// Prefer common Python entry when present
		expect(
			first!.path === 'app/main.py' ||
				(first!.outDegree ?? 0) + (first!.inDegree ?? 0) > 0,
		).toBe(true);
		expect(projectFileHub(graph, first!.id)).not.toBeNull();
	});
});
