import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogHotspots } from '@core/catalog/hotspots.ts';
import { catalogStartsSplit } from '@core/catalog/starts.ts';
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

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogHotspots', () => {
	it('ranks by rankScore descending (sort key, not raw edgeCount)', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const hot = catalogHotspots(graph);
		expect(hot.length).toBeGreaterThan(3);
		for (let i = 1; i < hot.length; i++) {
			const prev = hot[i - 1]!.rankScore ?? hot[i - 1]!.edgeCount;
			const cur = hot[i]!.rankScore ?? hot[i]!.edgeCount;
			expect(prev).toBeGreaterThanOrEqual(cur);
		}
		expect(hot[0]!.edgeCount).toBeGreaterThan(0);
		expect(hot[0]!.rankScore).toBeDefined();
		// Map catalog includes hotspots
		expect(catalog.hotspots.length).toBeGreaterThan(0);
		expect(catalog.hotspots[0]!.edgeCount).toBe(hot[0]!.edgeCount);
		expect(catalog.hotspots[0]!.rankScore).toBe(hot[0]!.rankScore);
	});

	it('publishes unique neighbor degrees; pure type-only sinks drop out', () => {
		const { graph } = indexFiles(
			files([
				['src/types.ts', 'export type T = string;\nexport type U = number;\n'],
				['src/a.ts', "import type { T } from './types';\nexport const a = 1;\n"],
				['src/b.ts', "import type { U } from './types';\nexport const b = 2;\n"],
				['src/hub.ts', "import { a } from './a';\nimport { b } from './b';\nexport const h = a + b;\n"],
			]),
		);
		const hot = catalogHotspots(graph);
		// types.ts has only type-only importers → not ranked
		expect(hot.some((h) => h.path === 'src/types.ts')).toBe(false);
		// hub has runtime neighbors
		const hub = hot.find((h) => h.path === 'src/hub.ts');
		expect(hub).toBeDefined();
		expect((hub!.uniqueOut ?? 0) + (hub!.uniqueIn ?? 0)).toBeGreaterThan(0);
		expect(hub!.rankScore).toBe(hub!.edgeCount); // no barrel demotion
	});

	it('does not double-count import+export-from same target as two unique neighbors', () => {
		const vfs: VirtualFile[] = [
			{
				path: 'src/barrel.ts',
				content: `import { a } from './util';\nexport { a } from './util';\n`,
				byteLength: 60,
			},
			{
				path: 'src/util.ts',
				content: `export const a = 1;\n`,
				byteLength: 20,
			},
		];
		const { graph } = indexFiles(vfs);
		const hot = catalogHotspots(graph);
		const barrel = hot.find((h) => h.path === 'src/barrel.ts');
		expect(barrel).toBeDefined();
		// two edge records out, one unique file neighbor
		expect(barrel!.outDegree).toBe(2);
		expect(barrel!.uniqueOut).toBe(1);
		expect(barrel!.edgeCount).toBe(1); // uniqueOut + uniqueIn
	});

	it('demotes pure barrels in rankScore while publishing pre-demotion edgeCount', () => {
		const { graph } = indexFiles(
			files([
				[
					'src/index.ts',
					`export { a } from './a';\nexport { b } from './b';\nexport { c } from './c';\n`,
				],
				['src/a.ts', 'export const a = 1;\n'],
				['src/b.ts', 'export const b = 2;\n'],
				['src/c.ts', 'export const c = 3;\n'],
				// runtime hub with fewer unique neighbors than barrel outs
				[
					'src/hub.ts',
					`import { a } from './a';\nimport { b } from './b';\nexport const h = 1;\n`,
				],
			]),
		);
		const hot = catalogHotspots(graph);
		const barrel = hot.find((h) => h.path === 'src/index.ts');
		const hub = hot.find((h) => h.path === 'src/hub.ts');
		expect(barrel).toBeDefined();
		expect(barrel!.roles).toContain('barrel');
		expect(barrel!.edgeCount).toBe(3); // unique outs
		expect(barrel!.rankScore).toBeCloseTo(3 * 0.35, 5);
		// hub should rank above demoted barrel despite lower edgeCount
		if (hub) {
			expect(hub.rankScore ?? 0).toBeGreaterThan(barrel!.rankScore ?? 0);
			const barrelIdx = hot.findIndex((h) => h.path === 'src/index.ts');
			const hubIdx = hot.findIndex((h) => h.path === 'src/hub.ts');
			expect(hubIdx).toBeLessThan(barrelIdx);
		}
	});

	it('attaches entrypoint role when entrypointSet is provided', () => {
		const { graph } = indexFiles(
			files([
				['package.json', JSON.stringify({ name: 't', main: 'src/index.ts' })],
				['src/index.ts', `import './leaf';\nexport const main = 1;\n`],
				['src/leaf.ts', `export const leaf = 1;\n`],
				['src/other.ts', `import './leaf';\nimport './index';\nexport const o = 1;\n`],
			]),
		);
		const { entrypoints } = catalogStartsSplit(graph, 40);
		const entrypointSet = new Set(entrypoints.map((e) => e.path));
		expect(entrypointSet.has('src/index.ts')).toBe(true);
		const hot = catalogHotspots(graph, 15, { entrypointSet });
		const idx = hot.find((h) => h.path === 'src/index.ts');
		// index may or may not appear depending on degrees; if it does, roles include entrypoint
		if (idx) {
			expect(idx.roles).toContain('entrypoint');
		}
		// Catalog path via indexFiles also wires entrypointSet
		const { catalog } = indexFiles(
			files([
				['package.json', JSON.stringify({ name: 't', main: 'src/index.ts' })],
				['src/index.ts', `import './leaf';\nexport const main = 1;\n`],
				['src/leaf.ts', `export const leaf = 1;\n`],
				['src/other.ts', `import './leaf';\nimport './index';\nexport const o = 1;\n`],
			]),
		);
		const catIdx = catalog.hotspots.find((h) => h.path === 'src/index.ts');
		if (catIdx) {
			expect(catIdx.roles).toContain('entrypoint');
		} else {
			// Ensure at least starts still have it and a forced hotspot call works
			const forced = catalogHotspots(graph, 40, { entrypointSet });
			const f = forced.find((h) => h.path === 'src/index.ts');
			expect(f?.roles).toContain('entrypoint');
		}
	});
});
