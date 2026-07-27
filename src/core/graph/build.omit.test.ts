import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import type { VirtualFile } from '@core/graph/types.ts';

function vf(path: string, content: string): VirtualFile {
	return { path, content, byteLength: content.length };
}

describe('buildGraph omitted targets', () => {
	it('stamps toKind omitted when relative target matches isOmittedPath', () => {
		const graph = buildGraph(
			[
				vf('src/a.ts', `import { b } from './b';\nimport { c } from './c';\n`),
				// b intentionally missing from feed (omitted); c present
				vf('src/c.ts', `export const c = 1;\n`),
			],
			{
				isOmittedPath: (p) => p === 'src/b.ts' || p.startsWith('src/b.'),
			},
		);
		const toB = graph.edges.find((e) => e.specifier === './b');
		const toC = graph.edges.find((e) => e.specifier === './c');
		expect(toB?.toKind).toBe('omitted');
		expect(toC?.toKind).toBe('file');
		// omitted does not inflate unresolvedCount
		expect(graph.stats.unresolvedCount).toBe(0);
	});

	it('keeps true unresolved when omit matcher does not match', () => {
		const graph = buildGraph([
			vf('src/a.ts', `import { missing } from './nope';\n`),
		]);
		const e = graph.edges.find((x) => x.specifier === './nope');
		expect(e?.toKind).toBe('unresolved');
		expect(graph.stats.unresolvedCount).toBe(1);
	});
});
