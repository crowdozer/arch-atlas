import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
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
	it('does not collapse 186 importers into a single client band', () => {
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
		const importerNodes = [
			...new Set(
				rev.data.flatMap((l) => [l.source, l.target]).filter((n) => n !== 'config.ts'),
			),
		];
		expect(importerNodes.length).toBeGreaterThan(1);
		expect(importerNodes).not.toEqual(['client']);
		expect(importerNodes.some((n) => n.includes('/'))).toBe(true);

		const total = rev.data.reduce((s, l) => s + l.value, 0);
		expect(total).toBe(186);
	});
});

describe('projectFileImporters demo fixtures', () => {
	it('redis fan-in still conserves on demo-next-complex', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const rev = projectFileImporters(graph, 'src/lib/redis.ts')!;
		const total = rev.data.reduce((s, l) => s + l.value, 0);
		expect(total).toBe(12);
	});
});
