import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import {
	deserializeCodeGraph,
	serializeCodeGraph,
	type SerializedCodeGraph,
} from '@core/graph/serialize.ts';

describe('serializeCodeGraph / deserializeCodeGraph', () => {
	it('round-trips a small CodeGraph (Maps ↔ arrays)', () => {
		const graph = buildGraph([
			{
				path: 'a.ts',
				content: `import { b } from './b';\nexport const a = b;\n`,
				byteLength: 40,
			},
			{
				path: 'b.ts',
				content: `export const b = 1;\n`,
				byteLength: 20,
			},
			{
				path: 'package.json',
				content: `{"name":"demo","dependencies":{"zod":"*"}}`,
				byteLength: 40,
			},
		]);

		const plain = serializeCodeGraph(graph);
		expect(Array.isArray(plain.files)).toBe(true);
		expect(Array.isArray(plain.contents)).toBe(true);
		expect(Array.isArray(plain.edges)).toBe(true);
		// JSON-safe (no Map)
		const viaJson = JSON.parse(JSON.stringify(plain)) as SerializedCodeGraph;
		const back = deserializeCodeGraph(viaJson);

		expect(back.files.size).toBe(graph.files.size);
		expect(back.contents.size).toBe(graph.contents.size);
		expect(back.edges.length).toBe(graph.edges.length);
		expect(back.stats.edgeCount).toBe(graph.stats.edgeCount);
		expect(back.contents.get('a.ts')).toBe(graph.contents.get('a.ts'));
		expect(back.files.get('b.ts')?.path).toBe('b.ts');
		expect(back.parseMap.has('a.ts')).toBe(true);
		expect(back.packageJsonPaths).toEqual(graph.packageJsonPaths);

		// Edge identity (file→file)
		const edge = back.edges.find((e) => e.from === 'a.ts' && e.to === 'b.ts');
		expect(edge?.toKind).toBe('file');
	});

	it('throws on invalid payload', () => {
		expect(() =>
			deserializeCodeGraph(null as unknown as SerializedCodeGraph),
		).toThrow(/expected serialized/);
		expect(() =>
			deserializeCodeGraph({ files: 'nope' } as unknown as SerializedCodeGraph),
		).toThrow(/files\/edges/);
	});
});
