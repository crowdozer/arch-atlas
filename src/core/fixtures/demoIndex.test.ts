/**
 * Index built-in demo fixture trees from disk (same files the UI loads).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexFiles } from '@core/index.ts';
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

	it('spaghetti-godfile yields godfile candidates and blast radius', () => {
		const files = walkFiles(path.join(root, 'demo-spaghetti-godfile'));
		expect(files.length).toBeGreaterThan(15);
		const { graph, catalog } = indexFiles(files);
		expect(graph.stats.sourceCount).toBeGreaterThan(15);
		expect(graph.stats.edgeCount).toBeGreaterThan(20);
		expect(graph.files.has('src/god/hub.ts')).toBe(true);

		// Multi-signal godfile bin should surface the hub
		expect(catalog.godfiles.length).toBeGreaterThan(0);
		const hub = catalog.godfiles.find((g) => g.path === 'src/god/hub.ts');
		expect(hub).toBeDefined();
		expect(hub!.inDegree).toBeGreaterThanOrEqual(2);
		expect(hub!.outDegree).toBeGreaterThanOrEqual(2);
		expect(hub!.domainsTouched).toBeGreaterThan(1);
		expect(hub!.score).toBeGreaterThan(0);
		expect(hub!.epistemic).toBe('inferred');

		// Blast radius: reverse consumers exist (domain/money, chain leaf, etc.)
		expect(catalog.blastRadius.length).toBeGreaterThan(0);
		expect(catalog.blastRadius[0]!.reverseReachFiles).toBeGreaterThan(0);
		expect(catalog.blastRadius.every((b) => b.epistemic === 'observed')).toBe(true);

		// Suggested views include godfile:/blast: shortcuts (not just bin presence)
		const viewIds = catalog.views.map((v) => v.id);
		expect(viewIds.some((id) => id.startsWith('godfile:'))).toBe(true);
		expect(viewIds.some((id) => id.startsWith('blast:'))).toBe(true);
	});
});
