import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	catalogComplex,
	catalogDeepest,
	importDepthStats,
} from '@core/catalog/deepest.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function walk(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full, base));
		else {
			const rel = path.relative(base, full).split(path.sep).join('/');
			const content = readFileSync(full, 'utf8');
			out.push({ path: rel, content, byteLength: Buffer.byteLength(content) });
		}
	}
	return out;
}

describe('catalogDeepest / importDepthStats', () => {
	it('ranks next-complex by max hops descending', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const deep = catalogDeepest(graph);
		expect(deep.length).toBeGreaterThan(3);
		for (let i = 1; i < deep.length; i++) {
			expect(deep[i - 1]!.maxHops).toBeGreaterThanOrEqual(deep[i]!.maxHops);
		}
		expect(deep[0]!.maxHops).toBeGreaterThanOrEqual(2);
		expect(catalog.deepest[0]!.path).toBe(deep[0]!.path);
	});

	it('stripe webhook is deeper than logger leaf', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const stripe = importDepthStats(graph, 'app/api/webhooks/stripe/route.ts');
		const logger = importDepthStats(graph, 'src/lib/logger.ts');
		expect(stripe.maxHops).toBeGreaterThan(logger.maxHops);
		expect(logger.maxHops).toBe(0);
		expect(stripe.reachableFiles).toBeGreaterThan(5);
		expect(stripe.packageEnds).toBeGreaterThan(2);
	});

	it('leaves are excluded from tree-depth list', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const deep = catalogDeepest(graph);
		expect(deep.every((d) => d.maxHops >= 1)).toBe(true);
		expect(deep.some((d) => d.path === 'src/lib/logger.ts')).toBe(false);
	});
});

describe('catalogComplex', () => {
	it('ranks by downwindEdges descending', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const complex = catalogComplex(graph);
		expect(complex.length).toBeGreaterThan(3);
		for (let i = 1; i < complex.length; i++) {
			expect(complex[i - 1]!.downwindEdges).toBeGreaterThanOrEqual(
				complex[i]!.downwindEdges,
			);
		}
		expect(complex[0]!.downwindEdges).toBeGreaterThan(0);
		expect(catalog.complex[0]!.path).toBe(complex[0]!.path);
	});

	it('counts file + package edges (start→page→pkg style mass)', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		// stripe webhook: many file hops + packages; downwindEdges > packageEnds
		const stripe = catalogComplex(graph).find(
			(c) => c.path === 'app/api/webhooks/stripe/route.ts',
		);
		expect(stripe).toBeTruthy();
		expect(stripe!.downwindEdges).toBeGreaterThan(stripe!.packageEnds);
		// downwindEdges is at least package ends + some file edges in the tree
		expect(stripe!.downwindEdges).toBeGreaterThanOrEqual(
			stripe!.packageEnds + (stripe!.reachableFiles - 1 > 0 ? 1 : 0),
		);
	});

	it('uses downwindEdges as primary rank (not maxHops alone)', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const complex = catalogComplex(graph);
		expect(complex[0]!.downwindEdges).toBe(
			Math.max(...complex.map((c) => c.downwindEdges)),
		);
		expect(complex.every((c) => c.downwindEdges >= 1)).toBe(true);
	});
});
