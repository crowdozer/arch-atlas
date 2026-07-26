import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogDeepest, importDepthStats } from '@core/catalog/deepest.ts';
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

	it('leaves are excluded from most-hops list', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const deep = catalogDeepest(graph);
		expect(deep.every((d) => d.maxHops >= 1)).toBe(true);
		expect(deep.some((d) => d.path === 'src/lib/logger.ts')).toBe(false);
	});
});
