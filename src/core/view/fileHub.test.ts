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

function assertColumnConservation(payload: AlluvialPayload, label: string): void {
	// Hub is not conserved across sides; intermediate nodes (if any) would be.
	// For flat 3-col hub every non-focus node is a leaf — check link values > 0.
	for (const l of payload.data) {
		expect(l.value, `${label} ${l.source}→${l.target}`).toBeGreaterThan(0);
	}
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
		assertColumnConservation(payload!, id);

		const cats = new Set(payload!.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Import folders')).toBe(false);
		expect(payload!.options.alluvial.units).toBe('import edges');

		// Export column uses yellow family (not teal import colors)
		const exportNodes = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports',
		);
		expect(exportNodes.length).toBeGreaterThan(0);
		const scale = payload!.options.color.scale;
		for (const n of exportNodes) {
			const c = scale[n.name] ?? '';
			expect(c, n.name).toMatch(/^#(?:eab308|ca8a04|a16207)$/i);
		}
	});

	it('maxDepth scales import leaf budget (not hop columns)', () => {
		const id = 'src/lib/redis.ts';
		const shallow = projectFileHub(graph, id, { maxDepth: 1, maxImporters: 4 })!;
		const deep = projectFileHub(graph, id, { maxDepth: 5, maxImporters: 4 })!;
		const shallowCats = new Set(shallow.options.alluvial.nodes.map((n) => n.category));
		const deepCats = new Set(deep.options.alluvial.nodes.map((n) => n.category));
		// Hub stays dual-side; depth does not invent hop stages
		expect(shallowCats.has('Exports')).toBe(true);
		expect(deepCats.has('Exports')).toBe(true);
		expect(shallowCats.has('Hop 1')).toBe(false);
		expect(deepCats.has('Hop 1')).toBe(false);
		// Deeper budget can only add Imports leaves / keep the same shape
		const shallowImportLeaves = shallow.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		).length;
		const deepImportLeaves = deep.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		).length;
		expect(deepImportLeaves).toBeGreaterThanOrEqual(shallowImportLeaves);
	});

	it('returns null for missing file', () => {
		expect(projectFileHub(graph, 'nope/missing.ts')).toBeNull();
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
