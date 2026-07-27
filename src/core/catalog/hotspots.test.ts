import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogHotspots } from '@core/catalog/hotspots.ts';
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

describe('catalogHotspots', () => {
	it('ranks next-complex files by edge count descending', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const hot = catalogHotspots(graph);
		expect(hot.length).toBeGreaterThan(3);
		for (let i = 1; i < hot.length; i++) {
			expect(hot[i - 1]!.edgeCount).toBeGreaterThanOrEqual(hot[i]!.edgeCount);
		}
		expect(hot[0]!.edgeCount).toBeGreaterThan(0);
		// Map catalog includes hotspots
		expect(catalog.hotspots.length).toBeGreaterThan(0);
		expect(catalog.hotspots[0]!.edgeCount).toBe(hot[0]!.edgeCount);
	});

	it('publishes unique neighbor degrees and edgeCount from unique score', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
		for (const h of catalogHotspots(graph)) {
			expect(h.uniqueOut ?? 0).toBeGreaterThanOrEqual(0);
			expect(h.uniqueIn ?? 0).toBeGreaterThanOrEqual(0);
			// edgeCount is unique-neighbor score (or edge-record fallback)
			expect(h.edgeCount).toBeGreaterThan(0);
			expect(h.edgeCount).toBeLessThanOrEqual(
				Math.max(h.outDegree + h.inDegree, (h.uniqueOut ?? 0) + (h.uniqueIn ?? 0) + h.packageOut),
			);
		}
	});

	it('does not double-count import+export-from same target as two unique neighbors', () => {
		const files: VirtualFile[] = [
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
		const { graph } = indexFiles(files);
		const hot = catalogHotspots(graph);
		const barrel = hot.find((h) => h.path === 'src/barrel.ts');
		expect(barrel).toBeDefined();
		// two edge records out, one unique file neighbor
		expect(barrel!.outDegree).toBe(2);
		expect(barrel!.uniqueOut).toBe(1);
		expect(barrel!.edgeCount).toBe(1); // uniqueOut + uniqueIn
	});
});
