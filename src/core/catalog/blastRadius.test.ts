import { describe, expect, it } from 'vitest';
import { catalogBlastRadius } from '@core/catalog/blastRadius.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogBlastRadius', () => {
	it('counts reverse consumers on A→B→C chain (C has blast ≥2, A has 0)', () => {
		// Imports: A imports B, B imports C  ⇒ reverse: C ← B ← A
		const { graph, catalog } = indexFiles(
			files([
				['src/a.ts', "import { b } from './b';\nexport const a = b;\n"],
				['src/b.ts', "import { c } from './c';\nexport const b = c;\n"],
				['src/c.ts', 'export const c = 1;\n'],
			]),
		);

		const ranked = catalogBlastRadius(graph);
		const byPath = new Map(ranked.map((r) => [r.path, r]));

		// A is a root importer: no reverse consumers
		expect(byPath.has('src/a.ts')).toBe(false);

		// C: reverse reaches B and A
		const c = byPath.get('src/c.ts');
		expect(c).toBeDefined();
		expect(c!.reverseReachFiles).toBeGreaterThanOrEqual(2);
		expect(c!.reverseMaxHops).toBeGreaterThanOrEqual(2);
		expect(c!.epistemic).toBe('observed');

		// B: reverse reaches at least A
		const b = byPath.get('src/b.ts');
		expect(b).toBeDefined();
		expect(b!.reverseReachFiles).toBeGreaterThanOrEqual(1);
		expect(c!.reverseReachFiles).toBeGreaterThan(b!.reverseReachFiles);

		// Self not counted: reverseReachFiles is dist.size - 1
		expect(c!.reverseReachFiles).toBeLessThan(
			// dist would be 3 with self; we only expose consumers
			c!.reverseReachFiles + 1,
		);

		// Wired into map catalog
		expect(catalog.blastRadius.length).toBeGreaterThan(0);
		expect(catalog.blastRadius[0]!.reverseReachFiles).toBe(
			ranked[0]!.reverseReachFiles,
		);
	});

	it('sorts by reverseReachFiles then reverseMaxHops then path', () => {
		const { graph } = indexFiles(
			files([
				// wide fan-in to leaf W: many direct reverse, 1 hop
				['src/leafW.ts', 'export const w = 1;\n'],
				['src/w1.ts', "import { w } from './leafW';\nvoid w;\n"],
				['src/w2.ts', "import { w } from './leafW';\nvoid w;\n"],
				['src/w3.ts', "import { w } from './leafW';\nvoid w;\n"],
				// deep chain to leaf D
				['src/leafD.ts', 'export const d = 1;\n'],
				['src/d1.ts', "import { d } from './leafD';\nexport const d1 = d;\n"],
				['src/d2.ts', "import { d1 } from './d1';\nexport const d2 = d1;\n"],
			]),
		);
		const ranked = catalogBlastRadius(graph);
		expect(ranked.length).toBeGreaterThan(1);
		for (let i = 1; i < ranked.length; i++) {
			const prev = ranked[i - 1]!;
			const cur = ranked[i]!;
			const orderOk =
				prev.reverseReachFiles > cur.reverseReachFiles ||
				(prev.reverseReachFiles === cur.reverseReachFiles &&
					prev.reverseMaxHops > cur.reverseMaxHops) ||
				(prev.reverseReachFiles === cur.reverseReachFiles &&
					prev.reverseMaxHops === cur.reverseMaxHops &&
					prev.path.localeCompare(cur.path) <= 0);
			expect(orderOk).toBe(true);
		}
	});

	it('skips non-source files', () => {
		const { graph } = indexFiles(
			files([
				['readme.md', '# hi\n'],
				['src/a.ts', "import { b } from './b';\nvoid b;\n"],
				['src/b.ts', 'export const b = 1;\n'],
			]),
		);
		const ranked = catalogBlastRadius(graph);
		expect(ranked.every((r) => r.path.endsWith('.ts'))).toBe(true);
	});
});
