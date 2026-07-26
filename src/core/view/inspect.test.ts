import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import {
	edgesForBand,
	edgesForNode,
	snippetsForEdges,
} from '@core/view/inspect.ts';

const sample = [
	{
		path: 'src/main.ts',
		content: `import { x } from './lib/util';\nimport zod from 'zod';\n`,
		byteLength: 0,
	},
	{
		path: 'src/lib/util.ts',
		content: `export const x = 1;\nimport 'react';\n`,
		byteLength: 0,
	},
	{
		path: 'package.json',
		content: `{"dependencies":{"zod":"3","react":"18"}}`,
		byteLength: 0,
	},
];

describe('inspect evidence', () => {
	const graph = buildGraph(sample);

	it('stores line numbers on edges', () => {
		const zod = graph.edges.find((e) => e.specifier === 'zod');
		expect(zod?.line).toBe(2);
		expect(zod?.from).toBe('src/main.ts');
	});

	it('edgesForNode package lists importers', () => {
		const edges = edgesForNode(graph, { kind: 'package', id: 'zod' });
		expect(edges.length).toBe(1);
		expect(edges[0]!.from).toBe('src/main.ts');
	});

	it('edgesForBand package → file is direct import', () => {
		const edges = edgesForBand(
			graph,
			{ kind: 'package', id: 'zod' },
			{ kind: 'file', id: 'src/main.ts' },
		);
		expect(edges).toHaveLength(1);
		expect(edges[0]!.specifier).toBe('zod');
	});

	it('snippets include source text at line', () => {
		const edges = edgesForNode(graph, { kind: 'package', id: 'zod' });
		const snips = snippetsForEdges(graph, edges);
		expect(snips).toHaveLength(1);
		expect(snips[0]!.line).toBe(2);
		expect(snips[0]!.text).toContain('zod');
		expect(snips[0]!.path).toBe('src/main.ts');
	});

	it('file→file reverse band', () => {
		const edges = edgesForBand(
			graph,
			{ kind: 'file', id: 'src/lib/util.ts' },
			{ kind: 'file', id: 'src/main.ts' },
		);
		expect(edges.some((e) => e.specifier.includes('util'))).toBe(true);
	});
});
