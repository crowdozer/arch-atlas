/**
 * Seed mapping S1–S4 - Carbon / straighten datums → FocusSeed.
 */
import { describe, expect, it } from 'vitest';
import {
	buildLogicalFocusGraphFromParts,
	type LogicalFocusGraph,
} from './logicalFocusGraph.ts';
import {
	seedFromCarbonLine,
	seedFromCarbonNode,
	seedFromStraightenData,
	stripMassSuffix,
	endpointName,
} from './displayAdapter.ts';

function tinyGraph(): LogicalFocusGraph {
	return buildLogicalFocusGraphFromParts({
		data: [
			{ source: 'src/main.tsx', target: 'src/App.tsx' },
			{ source: 'src/main.tsx', target: 'src/lib/logger.ts' },
		],
		nodeRef: {
			'src/main.tsx': { kind: 'file', id: 'src/main.tsx' },
			'src/App.tsx': { kind: 'file', id: 'src/App.tsx' },
			'src/lib/logger.ts': { kind: 'file', id: 'src/lib/logger.ts' },
			react: { kind: 'package', id: 'react' },
			'react-dom': { kind: 'package', id: 'react-dom' },
		},
		externalStraightPairs: [
			{ parent: 'src/main.tsx', packageName: 'react', width: 1 },
			{ parent: 'src/main.tsx', packageName: 'react-dom', width: 1 },
		],
		fileSpineName: 'src/main.tsx',
		nodes: [
			{ name: 'src/main.tsx', category: 'File' },
			{ name: 'src/App.tsx', category: 'Imports' },
			{ name: 'react', category: 'External' },
		],
	});
}

describe('displayAdapter seed mapping', () => {
	const graph = tinyGraph();

	it('S1: Carbon node datum name → file seed (strip mass)', () => {
		const seed = seedFromCarbonNode(graph, {
			name: 'src/App.tsx (12)',
		});
		expect(seed).toEqual({ kind: 'file', name: 'src/App.tsx' });
		const spine = seedFromCarbonNode(graph, { name: 'src/main.tsx' });
		expect(spine).toEqual({ kind: 'file-spine' });
		const pkg = seedFromCarbonNode(graph, { name: 'react' });
		expect(pkg).toEqual({ kind: 'package', name: 'react' });
		expect(stripMassSuffix('src/App.tsx (1,234)')).toBe('src/App.tsx');
	});

	it('S2: Carbon line → band seed', () => {
		const seed = seedFromCarbonLine({
			source: { name: 'src/main.tsx' },
			target: { name: 'src/App.tsx (3)' },
		});
		expect(seed).toEqual({
			kind: 'band',
			source: 'src/main.tsx',
			target: 'src/App.tsx',
			display: 'carbon',
		});
		expect(endpointName({ name: 'foo (9)' })).toBe('foo');
	});

	it('S3: Straighten __data__ → external band seed', () => {
		const seed = seedFromStraightenData({
			source: { name: 'src/main.tsx' },
			target: { name: 'react' },
		});
		expect(seed).toEqual({
			kind: 'band',
			source: 'src/main.tsx',
			target: 'react',
			display: 'straighten',
		});
	});

	it('S4: Rails never produce seeds', () => {
		const rail = '\u200b·in-rail·h2';
		expect(seedFromCarbonNode(graph, { name: rail })).toBeNull();
		expect(
			seedFromCarbonLine({
				source: { name: 'src/main.tsx' },
				target: { name: rail },
			}),
		).toBeNull();
		expect(
			seedFromStraightenData({
				source: { name: rail },
				target: { name: 'react' },
			}),
		).toBeNull();
	});
});
