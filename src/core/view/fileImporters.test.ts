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
	pathInImporterGroup,
	pathMatchesModuleKey,
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
		const flat = Array.from({ length: 10 }, (_, i) => `client/file${i}.ts`);
		const keyFlat = importerGroupKey(flat);
		expect(keyFlat('client/file0.ts')).toBe('client/(files)');

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

describe('pathInImporterGroup', () => {
	it('matches deepen keys with peers and (files) without peers', () => {
		const flat = Array.from({ length: 10 }, (_, i) => `client/file${i}.ts`);
		expect(pathInImporterGroup('client/file3.ts', 'client/(files)', flat)).toBe(true);
		expect(pathMatchesModuleKey('client/file3.ts', 'client/(files)')).toBe(true);
		expect(pathMatchesModuleKey('client/sim/a.ts', 'client/(files)')).toBe(false);
		expect(pathMatchesModuleKey('client/sim/a.ts', 'client/sim')).toBe(true);
	});
});

describe('projectFileImporters', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('logger: File → Imports only (no folder hop column)', () => {
		const fileId = 'src/lib/logger.ts';
		expect(preferFileImportersView(graph, fileId)).toBe(true);
		const rev = projectFileImporters(graph, fileId, { maxDepth: 2 })!;
		const cats = new Set(rev.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('Import folders')).toBe(false);
		expect(cats.has('Modules')).toBe(false);

		// Mass conserved
		const inn = graph.edges.filter(
			(e) => e.toKind === 'file' && e.to === fileId,
		).length;
		expect(focusMass(rev, 'logger.ts')).toBe(inn);
	});

	it('redis: flat file leaves when few importers', () => {
		const rev = projectFileImporters(graph, 'src/lib/redis.ts')!;
		expect(rev.options.alluvial.nodes.some((n) => n.category === 'Import folders')).toBe(
			false,
		);
		expect(focusMass(rev, 'redis.ts')).toBe(12);
		// Leaves should be files (nodeRef kind file)
		for (const n of rev.options.alluvial.nodes) {
			if (n.category !== 'Imports' || n.name.startsWith('+')) continue;
			expect(rev.meta.nodeRef[n.name]?.kind).toBe('file');
		}
	});
});

describe('projectFileImporters artillery config.ts', () => {
	it('many importers: File → Imports (folder *leaves*, not hop stage)', () => {
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
		expect(cats.has('Imports')).toBe(true);
		// No intermediate folder stage
		expect(cats.has('Import folders')).toBe(false);

		const importNodes = rev.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		);
		// Folder-key leaves like client/sim are OK as Imports labels
		expect(importNodes.some((n) => n.name.includes('/'))).toBe(true);
		expect(focusMass(rev, 'config.ts')).toBe(186);
	});
});
