import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { ingestZip } from '@core/ingest/zip.ts';
import { topFolder } from '@core/view/alluvial.ts';
import {
	importerGroupKey,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';

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

/** Conserved mass for reverse views: focus file outflow. */
function focusMass(payload: AlluvialPayload, focusLabel: string): number {
	const { out } = flowTotals(payload.data);
	return out.get(focusLabel) ?? 0;
}

describe('topFolder', () => {
	it('uses two segments for deep monorepo paths', () => {
		expect(topFolder('client/sim/foo.ts')).toBe('client/sim');
		expect(topFolder('src/lib/email.ts')).toBe('src/lib');
		expect(topFolder('client/main.ts')).toBe('client');
		expect(topFolder('config.ts')).toBe('(root)');
	});
});

describe('importerGroupKey', () => {
	it('deepens when one folder key owns almost all importers', () => {
		// All under client/* at depth 2 → topFolder collapses to "client"
		const flat = Array.from({ length: 10 }, (_, i) => `client/file${i}.ts`);
		const keyFlat = importerGroupKey(flat);
		expect(keyFlat('client/file0.ts')).toBe('client/(files)');

		// Mixed deep packages — topFolder already diverse, keep it
		const deep = [
			'client/sim/a.ts',
			'client/sim/b.ts',
			'client/game/c.ts',
			'client/render/d.ts',
			'server/routes/h.ts',
			'server/routes/i.ts',
			'server/routes/j.ts',
			'server/routes/k.ts',
		];
		const keyDeep = importerGroupKey(deep);
		expect(keyDeep('client/sim/a.ts')).toBe('client/sim');
		expect(keyDeep('server/routes/h.ts')).toBe('server/routes');
	});
});

describe('projectFileImporters artillery config.ts', () => {
	it('hops through modules and terminates at call-site files', () => {
		let buf: Buffer;
		try {
			buf = readFileSync(path.join(process.cwd(), '.grok/artillery.zip'));
		} catch {
			return;
		}
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const { files } = ingestZip(ab);
		const { graph } = indexFiles(files);
		const fileId = 'config.ts';
		expect(preferFileImportersView(graph, fileId)).toBe(true);

		const rev = projectFileImporters(graph, fileId)!;
		const cats = new Set(rev.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Import folders')).toBe(true);
		expect(cats.has('Imports')).toBe(true);

		// Intermediate hop — folder is not the terminal column
		const moduleNodes = rev.options.alluvial.nodes.filter(
			(n) => n.category === 'Import folders',
		);
		expect(moduleNodes.some((n) => n.name === 'client/sim')).toBe(true);

		// Right column is call-site files (or overflow), not module folders
		const importerNodes = rev.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		);
		expect(importerNodes.length).toBeGreaterThan(0);
		for (const n of importerNodes) {
			if (n.name.startsWith('(') || /^\+\s*\d+\s+more$/.test(n.name)) continue;
			const ref = rev.meta.nodeRef[n.name];
			expect(ref?.kind, n.name).toBe('file');
		}
		// Must not list client/sim as a terminal importer
		expect(importerNodes.map((n) => n.name)).not.toContain('client/sim');

		// Fat band client/sim must land on at least one named call-site file
		const simOut = rev.data.filter((l) => l.source === 'client/sim');
		const moreLabel = rev.options.alluvial.nodes.find(
			(n) => n.category === 'Imports' && /^\+\s*\d+\s+more$/.test(n.name),
		);
		expect(moreLabel, 'overflow label "+ N more"').toBeTruthy();
		const simNamed = simOut.filter((l) => l.target !== moreLabel!.name);
		expect(simNamed.length, 'client/sim should hop to named files').toBeGreaterThan(0);
		for (const l of simNamed) {
			expect(rev.meta.nodeRef[l.target]?.kind).toBe('file');
		}
		// Overflow sorts to bottom of Imports column
		const importerRanks = rev.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.rank);
		const maxRank = Math.max(...importerRanks);
		expect(moreLabel!.rank).toBe(maxRank);
		expect(rev.meta.nodeRef[moreLabel!.name]).toEqual({
			kind: 'bucket',
			id: 'other-importers',
		});

		// Conserved mass = inbound edges
		expect(focusMass(rev, 'config.ts')).toBe(186);
		const { out, inn } = flowTotals(rev.data);
		for (const n of moduleNodes) {
			expect(inn.get(n.name) ?? 0, n.name).toBe(out.get(n.name) ?? 0);
		}
		// Terminal importers receive full mass
		const importerIn = importerNodes.reduce((s, n) => s + (inn.get(n.name) ?? 0), 0);
		expect(importerIn).toBe(186);
	});
});

describe('projectFileImporters demo fixtures', () => {
	it('redis fan-in still conserves on demo-next-complex', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const rev = projectFileImporters(graph, 'src/lib/redis.ts')!;
		// ≤12 importers → flat File → files
		expect(rev.options.alluvial.nodes.some((n) => n.category === 'Import folders')).toBe(
			false,
		);
		expect(focusMass(rev, 'redis.ts')).toBe(12);
	});

	it('logger multi-hop ends at files, not folders', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const fileId = 'src/lib/logger.ts';
		const rev = projectFileImporters(graph, fileId)!;
		expect(preferFileImportersView(graph, fileId)).toBe(true);

		const cats = new Set(rev.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Import folders')).toBe(true);
		expect(cats.has('Imports')).toBe(true);

		const { out, inn } = flowTotals(rev.data);
		expect(out.get('logger.ts')).toBe(fileInMass(graph, fileId));
		for (const n of rev.options.alluvial.nodes) {
			if (n.category !== 'Import folders') continue;
			expect(inn.get(n.name) ?? 0, n.name).toBe(out.get(n.name) ?? 0);
		}
		const importerNodes = rev.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		);
		for (const n of importerNodes) {
			if (n.name.startsWith('(')) continue;
			expect(rev.meta.nodeRef[n.name]?.kind).toBe('file');
		}
	});
});

function fileInMass(
	graph: ReturnType<typeof indexFiles>['graph'],
	fileId: string,
): number {
	return graph.edges.filter((e) => e.toKind === 'file' && e.to === fileId).length;
}
