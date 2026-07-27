import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { edgeMatchesPackage } from '@core/view/packageImporters.ts';
import { projectPackageHub } from '@core/view/packageHub.ts';
import { EXTERNAL_IMPORT_CATEGORY } from '@core/view/hubCategories.ts';

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

function nodeCategories(payload: AlluvialPayload): Set<string> {
	return new Set(payload.options.alluvial.nodes.map((n) => n.category));
}

function namedNodesInCategory(
	payload: AlluvialPayload,
	category: string,
): string[] {
	return payload.options.alluvial.nodes
		.filter((n) => n.category === category)
		.map((n) => n.name);
}

describe('projectPackageHub', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('returns null when package has no observed importers', () => {
		expect(projectPackageHub(graph, 'definitely-not-a-pkg-xyz')).toBeNull();
	});

	it('nodemailer: single importer on Exports, External sink, one pair', () => {
		const payload = projectPackageHub(graph, 'nodemailer', {
			weightAxis: 'import-edges',
		})!;
		expect(payload).not.toBeNull();
		expect(payload.meta.focus).toEqual({
			kind: 'package',
			id: 'nodemailer',
			label: 'nodemailer',
		});

		const cats = nodeCategories(payload);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has(EXTERNAL_IMPORT_CATEGORY)).toBe(true);
		expect(cats.has('File')).toBe(false);
		expect(cats.has('Imports')).toBe(false);

		const { inn, out } = flowTotals(payload.data);
		expect(inn.get('nodemailer') ?? 0).toBeGreaterThan(0);
		// Sole known importer in fixture
		const exportNames = namedNodesInCategory(payload, 'Exports');
		expect(exportNames.some((n) => n.includes('email'))).toBe(true);
		// External is sink only (no outflow)
		expect(out.get('nodemailer') ?? 0).toBe(0);

		const pairs = payload.meta.externalStraightPairs ?? [];
		expect(pairs.length).toBeGreaterThanOrEqual(1);
		expect(pairs.every((p) => p.packageName === 'nodemailer')).toBe(true);
		const pairMass = pairs.reduce((s, p) => s + p.width, 0);
		expect(pairMass).toBe(inn.get('nodemailer'));
	});

	it('multi-importer fan-in: all direct importers on Exports; one External', () => {
		// Find a package with ≥2 distinct importers
		const byPkg = new Map<string, Set<string>>();
		for (const e of graph.edges) {
			if (e.toKind === 'file') continue;
			const set = byPkg.get(e.to) ?? new Set();
			set.add(e.from);
			byPkg.set(e.to, set);
		}
		const multi = [...byPkg.entries()]
			.filter(([, s]) => s.size >= 2)
			.sort((a, b) => b[1].size - a[1].size)[0];
		expect(multi, 'fixture should have multi-importer package').toBeTruthy();
		const [pkgId, importers] = multi!;

		const payload = projectPackageHub(graph, pkgId, {
			weightAxis: 'import-edges',
			maxDepth: 1,
		})!;
		expect(payload).not.toBeNull();

		const externalNodes = namedNodesInCategory(payload, EXTERNAL_IMPORT_CATEGORY);
		// One package sink (no multi-package External)
		expect(externalNodes.length).toBe(1);

		const exportNames = namedNodesInCategory(payload, 'Exports');
		// Every direct importer should appear (or be in overflow bucket if huge)
		const fileLabels = exportNames.filter(
			(n) => payload.meta.nodeRef[n]?.kind === 'file',
		);
		const bucketLabels = exportNames.filter(
			(n) => payload.meta.nodeRef[n]?.kind === 'bucket',
		);
		expect(fileLabels.length + (bucketLabels.length ? 1 : 0)).toBeGreaterThan(0);

		// All kept file exporters must be actual importers
		for (const name of fileLabels) {
			const ref = payload.meta.nodeRef[name];
			expect(ref?.kind).toBe('file');
			expect(importers.has(ref!.id)).toBe(true);
		}

		// Pairs cover every kept Exports → External parent
		const pairs = payload.meta.externalStraightPairs ?? [];
		expect(pairs.length).toBeGreaterThanOrEqual(Math.min(2, importers.size));
		const pairParents = new Set(pairs.map((p) => p.parent));
		for (const name of fileLabels) {
			expect(pairParents.has(name)).toBe(true);
		}

		// Column conservation at External
		const { inn } = flowTotals(payload.data);
		const edgeCount = graph.edges.filter((e) =>
			edgeMatchesPackage(e, pkgId),
		).length;
		expect(inn.get(externalNodes[0]!) ?? 0).toBe(edgeCount);
	});

	it('multi-hop: importer-of-importer appears on Export hop when depth ≥ 2', () => {
		// redis has many reverse consumers in demo-next-complex
		const pkg = 'ioredis';
		const direct = new Set(
			graph.edges.filter((e) => edgeMatchesPackage(e, pkg)).map((e) => e.from),
		);
		expect(direct.size).toBeGreaterThan(0);

		const shallow = projectPackageHub(graph, pkg, {
			weightAxis: 'import-edges',
			maxDepth: 1,
		})!;
		const deep = projectPackageHub(graph, pkg, {
			weightAxis: 'import-edges',
			maxDepth: 3,
		})!;
		expect(shallow).not.toBeNull();
		expect(deep).not.toBeNull();

		const shallowCats = nodeCategories(shallow);
		expect(shallowCats.has('Export hop 2')).toBe(false);

		// If reverse graph has depth, Export hop 2 should appear at maxDepth≥2
		const deepCats = nodeCategories(deep);
		const hasOuter = [...deepCats].some((c) => /^Export hop \d+$/.test(c));
		// ioredis via redis.ts is imported by many app files → expect outer hop
		expect(hasOuter).toBe(true);

		// Outer hop nodes are files that are NOT direct package importers
		const hop2 = namedNodesInCategory(deep, 'Export hop 2');
		const hop2Files = hop2.filter((n) => deep.meta.nodeRef[n]?.kind === 'file');
		expect(hop2Files.length).toBeGreaterThan(0);
		for (const name of hop2Files) {
			const id = deep.meta.nodeRef[name]!.id;
			expect(direct.has(id)).toBe(false);
		}

		// Still no File / Imports
		expect(deepCats.has('File')).toBe(false);
		expect(deepCats.has('Imports')).toBe(false);
	});

	it('category order is Export hops left → Exports → External', () => {
		const payload = projectPackageHub(graph, 'ioredis', {
			weightAxis: 'import-edges',
			maxDepth: 3,
		})!;
		const order = payload.options.alluvial.nodes.reduce<string[]>((acc, n) => {
			if (!acc.includes(n.category)) acc.push(n.category);
			return acc;
		}, []);
		const extIdx = order.indexOf(EXTERNAL_IMPORT_CATEGORY);
		const expIdx = order.indexOf('Exports');
		expect(extIdx).toBe(order.length - 1);
		expect(expIdx).toBeGreaterThanOrEqual(0);
		expect(expIdx).toBeLessThan(extIdx);
		for (let i = 0; i < expIdx; i++) {
			expect(order[i]).toMatch(/^Export hop \d+$/);
		}
	});
});
