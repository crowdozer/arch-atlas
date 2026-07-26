import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fileDistances, importDepthStats } from '@core/catalog/deepest.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	hopCategory,
	maxFileDistForDepth,
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

function hopOrder(payload: { options: { alluvial: { nodes: { category: string }[] } } }) {
	const seen: string[] = [];
	for (const n of payload.options.alluvial.nodes) {
		if (!n.category.startsWith('Hop')) continue;
		if (!seen.includes(n.category)) seen.push(n.category);
	}
	return seen;
}

describe('maxFileDistForDepth / stageForDepth / hopCategory', () => {
	it('maps viz depth to intermediate file radius', () => {
		expect(maxFileDistForDepth(1)).toBe(0);
		expect(maxFileDistForDepth(2)).toBe(1);
		expect(maxFileDistForDepth(3)).toBe(2);
		expect(maxFileDistForDepth(7)).toBe(6);
	});

	it('stageForDepth is identity inside radius, 0 outside', () => {
		expect(stageForDepth(1, 3)).toBe(1);
		expect(stageForDepth(3, 3)).toBe(3);
		expect(stageForDepth(4, 3)).toBe(0);
		expect(stageForDepth(0, 3)).toBe(0);
	});

	it('hop labels are exact Hop N (no ≥ collapse)', () => {
		expect(hopCategory(1)).toBe('Hop 1');
		expect(hopCategory(3)).toBe('Hop 3');
	});
});

describe('projectMultiHopAlluvial depth semantics (layout.tsx)', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
	const start = 'app/layout.tsx';

	it('has outbound depth 4 in the fixture', () => {
		expect(importDepthStats(graph, start).maxHops).toBe(4);
	});

	it('depth 1: Imports → File only (no hop columns)', () => {
		const payload = projectMultiHopAlluvial(graph, start, { maxDepth: 1 })!;
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect([...cats].filter((c) => c.startsWith('Hop'))).toEqual([]);

		// Only packages imported directly by layout.tsx
		const { dist } = fileDistances(graph, start);
		let directPkg = 0;
		for (const e of graph.edges) {
			if (e.from !== start) continue;
			if (e.toKind === 'package' || e.toKind === 'unresolved') directPkg += 1;
		}
		const { inn, out } = flowTotals(payload.data);
		const fileIn = inn.get('layout.tsx') ?? 0;
		const endOut = payload.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.reduce((s, n) => s + (out.get(n.name) ?? 0), 0);
		expect(fileIn).toBe(directPkg);
		expect(endOut).toBe(directPkg);
		expect(fileIn).toBeGreaterThan(0);
		void dist;
	});

	it('depth 2: Imports → Hop 1 → File', () => {
		const payload = projectMultiHopAlluvial(graph, start, { maxDepth: 2 })!;
		expect(hopOrder(payload)).toEqual(['Hop 1']);
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		// No Hop 2 at depth 2
		expect(cats.has('Hop 2')).toBe(false);
	});

	it('depth 3: Imports → Hop 2 → Hop 1 → File', () => {
		const payload = projectMultiHopAlluvial(graph, start, { maxDepth: 3 })!;
		expect(hopOrder(payload)).toEqual(['Hop 2', 'Hop 1']);
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Hop 3')).toBe(false);
	});

	it('depth ≥5 still unique headers up to graph maxHops (4)', () => {
		const payload = projectMultiHopAlluvial(graph, start, { maxDepth: 7 })!;
		expect(hopOrder(payload)).toEqual(['Hop 4', 'Hop 3', 'Hop 2', 'Hop 1']);
		// No duplicate category strings across nodes
		const hopCats = payload.options.alluvial.nodes
			.map((n) => n.category)
			.filter((c) => c.startsWith('Hop'));
		expect(new Set(hopCats).size).toBe(4);
	});

	it('conserves mass for each depth', () => {
		for (const maxDepth of [1, 2, 3, 4, 7]) {
			const payload = projectMultiHopAlluvial(graph, start, { maxDepth })!;
			const { out, inn } = flowTotals(payload.data);
			const codeIn = inn.get('layout.tsx') ?? 0;
			const endOut = payload.options.alluvial.nodes
				.filter((n) => n.category === 'Imports' || n.category === 'Ends')
				.reduce((s, n) => s + (out.get(n.name) ?? 0), 0);
			expect(codeIn, `depth ${maxDepth}`).toBe(endOut);
			expect(codeIn, `depth ${maxDepth}`).toBeGreaterThan(0);
			// Hop intermediates conserve when they have both in and out
			for (const n of payload.options.alluvial.nodes) {
				if (!n.category.startsWith('Hop')) continue;
				const i = inn.get(n.name) ?? 0;
				const o = out.get(n.name) ?? 0;
				if (i > 0 && o > 0) expect(i, n.name).toBe(o);
			}
		}
	});
});

describe('projectMultiHopAlluvial (page.tsx / misc)', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('page.tsx depth default exposes hop columns when tree is deep', () => {
		const start = 'app/page.tsx';
		expect(importDepthStats(graph, start).maxHops).toBeGreaterThanOrEqual(2);
		const payload = projectMultiHopAlluvial(graph, start, { maxDepth: 7 })!;
		const hopCats = hopOrder(payload);
		expect(hopCats.length).toBeGreaterThanOrEqual(1);
		expect(
			payload.options.alluvial.nodes.some((n) => n.category === 'Imports'),
		).toBe(true);
		expect(
			payload.options.alluvial.nodes.some((n) => n.category === 'File'),
		).toBe(true);
	});

	it('falls back without hop columns for pure leaves', () => {
		const payload = projectMultiHopAlluvial(graph, 'src/lib/logger.ts', {
			maxDepth: 7,
		});
		expect(payload).not.toBeNull();
		const hopCats = payload!.options.alluvial.nodes.filter((n) =>
			n.category.startsWith('Hop'),
		);
		// logger may have no package surface from itself
		expect(hopCats.length).toBe(0);
	});

	it.each(['importer-loc', 'target-loc'] as const)(
		'conserves under weightAxis=%s at depth 7',
		(weightAxis) => {
			const start = 'app/page.tsx';
			const payload = projectMultiHopAlluvial(graph, start, {
				weightAxis,
				maxDepth: 7,
			})!;
			const { out, inn } = flowTotals(payload.data);
			const codeIn = inn.get('page.tsx') ?? 0;
			const endOut = payload.options.alluvial.nodes
				.filter((n) => n.category === 'Imports')
				.reduce((s, n) => s + (out.get(n.name) ?? 0), 0);
			expect(codeIn).toBe(endOut);
			expect(codeIn).toBeGreaterThan(0);
		},
	);
});
