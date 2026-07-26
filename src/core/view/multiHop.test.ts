import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fileDistances, importDepthStats } from '@core/catalog/deepest.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	hopCategory,
	projectMultiHopAlluvial,
	stageForDepth,
} from '@core/view/multiHop.ts';

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

function flowTotals(data: { source: string; target: string; value: number }[]) {
	const out = new Map<string, number>();
	const inn = new Map<string, number>();
	for (const l of data) {
		out.set(l.source, (out.get(l.source) ?? 0) + l.value);
		inn.set(l.target, (inn.get(l.target) ?? 0) + l.value);
	}
	return { out, inn };
}

describe('stageForDepth', () => {
	it('caps deep hops into max stage', () => {
		expect(stageForDepth(1, 5)).toBe(1);
		expect(stageForDepth(5, 5)).toBe(5);
		expect(stageForDepth(8, 5)).toBe(5);
		expect(stageForDepth(0, 5)).toBe(0);
	});
});

describe('hopCategory', () => {
	it('uses ≥ only on outermost stage when graph is deeper than viz cap', () => {
		expect(hopCategory(1, 1, 4)).toBe('Hop ≥1');
		expect(hopCategory(2, 2, 4)).toBe('Hop ≥2');
		expect(hopCategory(1, 2, 4)).toBe('Hop 1');
		// No collapse when stages cover the full tree
		expect(hopCategory(4, 4, 4)).toBe('Hop 4');
		expect(hopCategory(1, 4, 4)).toBe('Hop 1');
	});
});

describe('projectMultiHopAlluvial', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('page.tsx exposes multiple Hop categories', () => {
		const start = 'app/page.tsx';
		expect(importDepthStats(graph, start).maxHops).toBeGreaterThanOrEqual(2);

		const payload = projectMultiHopAlluvial(graph, start);
		expect(payload).not.toBeNull();
		const cats = new Set(payload!.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Ends')).toBe(true);
		expect(cats.has('Code')).toBe(true);
		const hopCats = [...cats].filter((c) => c.startsWith('Hop'));
		expect(hopCats.length).toBeGreaterThanOrEqual(2);

		const { out, inn } = flowTotals(payload!.data);
		for (const n of payload!.options.alluvial.nodes) {
			if (!n.category.startsWith('Hop')) continue;
			const i = inn.get(n.name) ?? 0;
			const o = out.get(n.name) ?? 0;
			if (i > 0 && o > 0) expect(i, n.name).toBe(o);
		}
	});

	it('package mass into code equals reachable package edges', () => {
		const start = 'app/page.tsx';
		const { dist } = fileDistances(graph, start);
		let pkgN = 0;
		for (const e of graph.edges) {
			if (!dist.has(e.from)) continue;
			if (e.toKind === 'package' || e.toKind === 'unresolved') pkgN += 1;
		}
		const payload = projectMultiHopAlluvial(graph, start)!;
		const { inn, out } = flowTotals(payload.data);
		const codeIn = inn.get('page.tsx') ?? 0;
		const endOut = payload.options.alluvial.nodes
			.filter((n) => n.category === 'Ends')
			.reduce((s, n) => s + (out.get(n.name) ?? 0), 0);
		expect(endOut).toBe(pkgN);
		expect(codeIn).toBe(pkgN);
	});

	it('stripe webhook is multi-hop with hop columns', () => {
		const start = 'app/api/webhooks/stripe/route.ts';
		expect(importDepthStats(graph, start).maxHops).toBeGreaterThanOrEqual(2);
		const payload = projectMultiHopAlluvial(graph, start)!;
		const hopCats = payload.options.alluvial.nodes.filter((n) =>
			n.category.startsWith('Hop'),
		);
		expect(hopCats.length).toBeGreaterThan(0);
	});

	it('falls back to 3-col shape for leaves (no Hop categories)', () => {
		const payload = projectMultiHopAlluvial(graph, 'src/lib/logger.ts');
		expect(payload).not.toBeNull();
		const hopCats = payload!.options.alluvial.nodes.filter((n) =>
			n.category.startsWith('Hop'),
		);
		expect(hopCats.length).toBe(0);
	});

	it.each(['importer-loc', 'target-loc'] as const)(
		'conserves hop nodes under weightAxis=%s',
		(weightAxis) => {
			const start = 'app/page.tsx';
			const payload = projectMultiHopAlluvial(graph, start, { weightAxis })!;
			const { out, inn } = flowTotals(payload.data);
			for (const n of payload.options.alluvial.nodes) {
				if (!n.category.startsWith('Hop')) continue;
				const i = inn.get(n.name) ?? 0;
				const o = out.get(n.name) ?? 0;
				if (i > 0 && o > 0) expect(i, n.name).toBe(o);
			}
			// code inflow equals total end outflow (global conservation)
			const codeIn = inn.get('page.tsx') ?? 0;
			const endOut = payload.options.alluvial.nodes
				.filter((n) => n.category === 'Ends')
				.reduce((s, n) => s + (out.get(n.name) ?? 0), 0);
			expect(codeIn).toBe(endOut);
			expect(codeIn).toBeGreaterThan(0);
		},
	);

	it('layout.tsx: each maxHopStages yields unique hop headers (no duplicate columns)', () => {
		const start = 'app/layout.tsx';
		expect(importDepthStats(graph, start).maxHops).toBe(4);

		for (const maxHopStages of [1, 2, 3, 4, 5, 7]) {
			const payload = projectMultiHopAlluvial(graph, start, { maxHopStages })!;
			const hopCats = payload.options.alluvial.nodes
				.map((n) => n.category)
				.filter((c) => c.startsWith('Hop'));
			const unique = new Set(hopCats);
			// Carbon columns = unique categories; duplicates mean sankey split one stage
			expect(
				unique.size,
				`maxHopStages=${maxHopStages} cats=${[...unique].join(',')}`,
			).toBe(hopCats.filter((c, i, a) => a.indexOf(c) === i).length);

			// Expected column count = min(maxHops, maxHopStages)
			const expected = Math.min(4, maxHopStages);
			expect(unique.size, `maxHopStages=${maxHopStages}`).toBe(expected);

			// No same-category appearing twice in categoryOrder
			const order = [
				...new Set(
					payload.options.alluvial.nodes
						.map((n) => n.category)
						.filter((c) => c.startsWith('Hop')),
				),
			];
			// Order should be deep→shallow: higher stage first
			if (maxHopStages === 1) {
				expect([...unique][0]).toBe('Hop ≥1');
			}
			if (maxHopStages === 2) {
				expect(order).toEqual(['Hop ≥2', 'Hop 1']);
			}
			if (maxHopStages === 3) {
				expect(order).toEqual(['Hop ≥3', 'Hop 2', 'Hop 1']);
			}
			if (maxHopStages >= 4) {
				expect(order).toEqual(['Hop 4', 'Hop 3', 'Hop 2', 'Hop 1']);
			}

			// Conservation still holds
			const { out, inn } = flowTotals(payload.data);
			const codeIn = inn.get('layout.tsx') ?? 0;
			const endOut = payload.options.alluvial.nodes
				.filter((n) => n.category === 'Ends')
				.reduce((s, n) => s + (out.get(n.name) ?? 0), 0);
			expect(codeIn).toBe(endOut);
			expect(codeIn).toBeGreaterThan(0);
		}
	});
});
