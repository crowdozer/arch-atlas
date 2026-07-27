import { describe, expect, it } from 'vitest';
import {
	catalogCycles,
	stronglyConnectedComponents,
} from '@core/catalog/cycles.ts';
import { buildGraph } from '@core/graph/build.ts';
import type { VirtualFile } from '@core/graph/types.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogCycles', () => {
	it('finds mutual runtime SCCs and ignores typeOnly for runtime partition', () => {
		const graph = buildGraph(
			files([
				['a.ts', `import { b } from './b';\nexport const a = 1;\n`],
				['b.ts', `import { a } from './a';\nexport const b = 1;\n`],
				['c.ts', `import type { a } from './a';\nexport type T = typeof a;\n`],
				['d.ts', `import type { T } from './e';\nexport type U = T;\n`],
				['e.ts', `import type { U } from './d';\nexport type T = U;\n`],
			]),
		);
		const { runtime, type } = catalogCycles(graph, 15);
		const ab = runtime.find(
			(c) => c.samplePaths.includes('a.ts') && c.samplePaths.includes('b.ts'),
		);
		expect(ab?.size).toBe(2);
		expect(ab?.edgeCount).toBeGreaterThanOrEqual(2);

		// type-only mutual cycle
		const de = type.find(
			(c) => c.samplePaths.includes('d.ts') && c.samplePaths.includes('e.ts'),
		);
		expect(de?.size).toBe(2);
		// runtime partition should not claim d↔e
		expect(
			runtime.some(
				(c) =>
					c.samplePaths.includes('d.ts') && c.samplePaths.includes('e.ts'),
			),
		).toBe(false);
	});

	it('Tarjan returns only size ≥ 2 components', () => {
		const adj = new Map<string, string[]>([
			['a', ['b']],
			['b', ['a']],
			['c', []],
		]);
		const comps = stronglyConnectedComponents(adj);
		expect(comps).toHaveLength(1);
		expect(comps[0]!.sort()).toEqual(['a', 'b']);
	});
});
