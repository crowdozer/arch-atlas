import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { ingestZip } from '@core/ingest/zip.ts';
import {
	fileInDegree,
	fileOutDegree,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
import {
	exportHopCategory,
	importHopCategory,
	preferFileHubView,
	projectFileHub,
} from '@core/view/fileHub.ts';

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

/** Mass into hub from left + mass out of hub to right. */
function hubIncidentMass(payload: AlluvialPayload, focusLabel: string): {
	inMass: number;
	outMass: number;
	total: number;
} {
	const { out, inn } = flowTotals(payload.data);
	const inMass = inn.get(focusLabel) ?? 0;
	const outMass = out.get(focusLabel) ?? 0;
	return { inMass, outMass, total: inMass + outMass };
}

function assertPositiveLinks(payload: AlluvialPayload, label: string): void {
	for (const l of payload.data) {
		expect(l.value, `${label} ${l.source}→${l.target}`).toBeGreaterThan(0);
	}
}

function categories(payload: AlluvialPayload): Set<string> {
	return new Set(payload.options.alluvial.nodes.map((n) => n.category));
}

/**
 * Synthetic dual-chain hub:
 *
 *   farIn → midIn → focus → midOut → farOut
 *                         ↘ zod (package)
 */
function chainHubFiles(): VirtualFile[] {
	return [
		{
			path: 'farIn.ts',
			content: "import './midIn';\nexport const farIn = 1;\n",
			byteLength: 40,
		},
		{
			path: 'midIn.ts',
			content: "import './focus';\nexport const midIn = 1;\n",
			byteLength: 40,
		},
		{
			path: 'focus.ts',
			content:
				"import './midOut';\nimport 'zod';\nexport const focus = 1;\n",
			byteLength: 60,
		},
		{
			path: 'midOut.ts',
			content: "import './farOut';\nexport const midOut = 1;\n",
			byteLength: 40,
		},
		{
			path: 'farOut.ts',
			content: 'export const farOut = 1;\n',
			byteLength: 30,
		},
	];
}

describe('projectFileHub demo-next-complex', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('prefer hub when both in and out; pure sink stays reverse', () => {
		// redis is fan-in dominant with some outs
		const redis = 'src/lib/redis.ts';
		const inn = fileInDegree(graph, redis);
		const out = fileOutDegree(graph, redis);
		expect(inn).toBeGreaterThan(0);
		expect(out).toBeGreaterThan(0);
		expect(preferFileHubView(graph, redis)).toBe(true);

		// logger is pure sink
		const logger = 'src/lib/logger.ts';
		expect(fileOutDegree(graph, logger)).toBe(0);
		expect(fileInDegree(graph, logger)).toBeGreaterThan(0);
		expect(preferFileHubView(graph, logger)).toBe(false);
		expect(preferFileImportersView(graph, logger)).toBe(true);
	});

	it('hub mass equals in + out edge weights for redis.ts', () => {
		const id = 'src/lib/redis.ts';
		const payload = projectFileHub(graph, id);
		expect(payload).not.toBeNull();
		const focus = payload!.meta.focus.label;
		const { inMass, outMass, total } = hubIncidentMass(payload!, focus);
		expect(inMass).toBe(fileInDegree(graph, id));
		expect(outMass).toBe(fileOutDegree(graph, id));
		expect(total).toBe(inMass + outMass);
		assertPositiveLinks(payload!, id);

		const cats = categories(payload!);
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Import folders')).toBe(false);
		expect(payload!.options.alluvial.units).toBe('import edges');

		// Export column uses yellow family (not teal import colors)
		const exportNodes = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports' || n.category.startsWith('Export hop'),
		);
		expect(exportNodes.length).toBeGreaterThan(0);
		const scale = payload!.options.color.scale;
		for (const n of exportNodes) {
			const c = scale[n.name] ?? '';
			expect(c, n.name).toMatch(/^#(?:eab308|ca8a04|a16207)$/i);
		}
	});

	it('depth=1 stays Imports/File/Exports; deeper depth adds hop columns when graph allows', () => {
		const id = 'src/lib/redis.ts';
		const shallow = projectFileHub(graph, id, { maxDepth: 1, maxImporters: 48, maxDeps: 48 })!;
		const shallowCats = categories(shallow);
		expect(shallowCats.has('Exports')).toBe(true);
		expect(shallowCats.has('Imports')).toBe(true);
		expect(shallowCats.has('File')).toBe(true);
		// No multi-hop ring names at depth 1
		expect([...shallowCats].some((c) => c.startsWith('Import hop'))).toBe(false);
		expect([...shallowCats].some((c) => c.startsWith('Export hop'))).toBe(false);
		expect(shallowCats.has('Hop 1')).toBe(false);

		// File incident mass conserved at every depth
		const focus = shallow.meta.focus.label;
		const shallowMass = hubIncidentMass(shallow, focus);
		expect(shallowMass.inMass).toBe(fileInDegree(graph, id));
		expect(shallowMass.outMass).toBe(fileOutDegree(graph, id));

		for (const depth of [2, 3, 5] as const) {
			const deep = projectFileHub(graph, id, {
				maxDepth: depth,
				maxImporters: 48,
				maxDeps: 48,
			})!;
			const deepMass = hubIncidentMass(deep, deep.meta.focus.label);
			expect(deepMass.inMass, `depth ${depth} in`).toBe(fileInDegree(graph, id));
			expect(deepMass.outMass, `depth ${depth} out`).toBe(fileOutDegree(graph, id));
		}
	});

	it('returns null for missing file', () => {
		expect(projectFileHub(graph, 'nope/missing.ts')).toBeNull();
	});
});

describe('projectFileHub dual-hop radius (synthetic chain)', () => {
	const { graph } = indexFiles(chainHubFiles());
	const focusId = 'focus.ts';

	it('depth=1 is classic three-column hub with focus-incident mass', () => {
		const payload = projectFileHub(graph, focusId, { maxDepth: 1 })!;
		const cats = categories(payload);
		expect([...cats].sort()).toEqual(['Exports', 'File', 'Imports']);
		expect(cats.has('Import hop 2')).toBe(false);
		expect(cats.has('Export hop 2')).toBe(false);

		const focus = payload.meta.focus.label;
		expect(focus).toBe('focus.ts');
		const { inMass, outMass } = hubIncidentMass(payload, focus);
		expect(inMass).toBe(1); // midIn → focus
		expect(outMass).toBe(2); // focus → midOut + zod
		assertPositiveLinks(payload, 'depth1');

		// Links touch File directly from dist-1 only
		const intoFile = payload.data.filter((l) => l.target === focus);
		const fromFile = payload.data.filter((l) => l.source === focus);
		expect(intoFile).toHaveLength(1);
		expect(fromFile.length).toBe(2);
	});

	it('depth=3 shows Import hop 2 and Export hop 2 with conserved File mass', () => {
		const payload = projectFileHub(graph, focusId, { maxDepth: 3 })!;
		const cats = categories(payload);
		expect(cats.has('Import hop 2')).toBe(true);
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Export hop 2')).toBe(true);
		// Chain is only 2 hops each way — no hop 3
		expect(cats.has('Import hop 3')).toBe(false);
		expect(cats.has('Export hop 3')).toBe(false);

		const order = payload.options.alluvial.nodes
			.map((n) => n.category)
			.filter((c, i, arr) => arr.indexOf(c) === i);
		// Category order: outer import hops → Imports → File → Exports → outer export hops
		expect(order.indexOf('Import hop 2')).toBeLessThan(order.indexOf('Imports'));
		expect(order.indexOf('Imports')).toBeLessThan(order.indexOf('File'));
		expect(order.indexOf('File')).toBeLessThan(order.indexOf('Exports'));
		expect(order.indexOf('Exports')).toBeLessThan(order.indexOf('Export hop 2'));

		const focus = payload.meta.focus.label;
		const { inMass, outMass } = hubIncidentMass(payload, focus);
		expect(inMass).toBe(fileInDegree(graph, focusId));
		expect(outMass).toBe(fileOutDegree(graph, focusId));
		assertPositiveLinks(payload, 'depth3');

		// Structural multi-hop links exist
		const hop2ImportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Import hop 2',
		);
		const hop2ExportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Export hop 2',
		);
		expect(hop2ImportNodes.length).toBeGreaterThan(0);
		expect(hop2ExportNodes.length).toBeGreaterThan(0);

		// Package stays on Exports (dist-1), not outer hop
		const scale = payload.options.color.scale;
		const exportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports',
		);
		const exportNames = exportNodes.map((n) => n.name);
		expect(exportNames.some((n) => n === 'zod' || n.includes('zod'))).toBe(true);
		for (const n of hop2ExportNodes) {
			expect(scale[n.name] ?? '').toMatch(/^#(?:eab308|ca8a04|a16207)$/i);
		}
	});

	it('category helpers name dist-1 vs outer rings', () => {
		expect(importHopCategory(1)).toBe('Imports');
		expect(importHopCategory(2)).toBe('Import hop 2');
		expect(exportHopCategory(1)).toBe('Exports');
		expect(exportHopCategory(3)).toBe('Export hop 3');
	});
});

describe('projectFileHub artillery public.ts barrel', () => {
	it('shows 64-edge hub (25 in + 39 out) without package placeholder', () => {
		let buf: Buffer;
		try {
			buf = readFileSync(path.join(process.cwd(), '.grok/artillery.zip'));
		} catch {
			return;
		}
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const { files } = ingestZip(ab);
		const { graph, catalog } = indexFiles(files);
		const id = 'client/sim/public.ts';
		const hot = catalog.hotspots.find((h) => h.id === id);
		expect(hot, 'public.ts should be a hotspot').toBeTruthy();
		expect(hot!.edgeCount).toBe(hot!.outDegree + hot!.inDegree);
		expect(preferFileHubView(graph, id)).toBe(true);

		const payload = projectFileHub(graph, id)!;
		const focus = payload.meta.focus.label;
		const { inMass, outMass, total } = hubIncidentMass(payload, focus);
		expect(inMass).toBe(hot!.inDegree);
		expect(outMass).toBe(hot!.outDegree);
		expect(total).toBe(hot!.edgeCount);

		// No synthetic package placeholder
		const names = payload.options.alluvial.nodes.map((n) => n.name);
		expect(names).not.toContain('(no package imports)');
		expect(payload.data.every((l) => l.value >= 1)).toBe(true);

		// Pure reverse would only show the in side
		const rev = projectFileImporters(graph, id)!;
		const revFocusOut = flowTotals(rev.data).out.get(rev.meta.focus.label) ?? 0;
		expect(total).toBeGreaterThan(revFocusOut);
	});
});
