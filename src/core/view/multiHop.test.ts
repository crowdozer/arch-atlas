import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fileDistances, importDepthStats } from '@core/catalog/deepest.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectMultiHopAlluvial, stageForDepth } from '@core/view/multiHop.ts';

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
});
