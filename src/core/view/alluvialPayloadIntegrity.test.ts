/**
 * Integrity oracle unit tests: fails on deliberately malformed payloads;
 * passes on a healthy projector payload.
 */
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import {
	assertAlluvialPayloadIntegrity,
	assertFocusGraphNoRails,
	collectAlluvialPayloadIntegrityIssues,
	collectFocusGraphRailIssues,
} from '@core/view/alluvialPayloadIntegrity.ts';
import { buildLogicalFocusGraph } from '../../stage/focus/logicalFocusGraph.ts';

function basePayload(
	over: Partial<AlluvialPayload> & {
		data?: AlluvialPayload['data'];
		nodes?: AlluvialPayload['options']['alluvial']['nodes'];
		nodeRef?: AlluvialPayload['meta']['nodeRef'];
		nodeRank?: AlluvialPayload['meta']['nodeRank'];
		scale?: Record<string, string>;
		pairs?: AlluvialPayload['meta']['externalStraightPairs'];
		focusLabel?: string;
	} = {},
): AlluvialPayload {
	const nodes = over.nodes ?? [
		{ name: 'a.ts', category: 'File', rank: 0 },
		{ name: 'b.ts', category: 'Imports', rank: 0 },
	];
	const data = over.data ?? [{ source: 'a.ts', target: 'b.ts', value: 1 }];
	const nodeRef = over.nodeRef ?? {
		'a.ts': { kind: 'file' as const, id: 'a.ts' },
		'b.ts': { kind: 'file' as const, id: 'b.ts' },
	};
	const nodeRank = over.nodeRank ?? { 'a.ts': 0, 'b.ts': 0 };
	const scale = over.scale ?? { 'a.ts': '#111', 'b.ts': '#222' };
	const focusLabel = over.focusLabel ?? 'a.ts';
	return {
		data,
		options: {
			title: '',
			theme: 'g100',
			height: '400px',
			animations: false,
			toolbar: { enabled: false },
			legend: { enabled: false, clickable: false },
			accessibility: { svgAriaLabel: 'test' },
			alluvial: {
				units: 'test',
				nodes,
				nodeAlignment: 'left',
			},
			color: { scale },
			tooltip: { enabled: true },
		},
		meta: {
			focus: { kind: 'file', id: 'a.ts', label: focusLabel },
			nodeRef,
			nodeRank,
			externalStraightPairs: over.pairs,
			bandSort: 'name',
		},
	};
}

describe('collectAlluvialPayloadIntegrityIssues', () => {
	it('accepts a well-formed synthetic payload', () => {
		expect(collectAlluvialPayloadIntegrityIssues(basePayload())).toEqual([]);
	});

	it('flags duplicate node names', () => {
		const issues = collectAlluvialPayloadIntegrityIssues(
			basePayload({
				nodes: [
					{ name: 'x', category: 'File', rank: 0 },
					{ name: 'x', category: 'Imports', rank: 0 },
				],
				data: [{ source: 'x', target: 'x', value: 1 }],
				nodeRef: { x: { kind: 'file', id: 'x' } },
				nodeRank: { x: 0 },
				scale: { x: '#000' },
				focusLabel: 'x',
			}),
		);
		expect(issues.some((i) => i.includes('duplicate'))).toBe(true);
		expect(issues.some((i) => i.includes('self-link'))).toBe(true);
	});

	it('flags missing endpoints, non-positive values, missing coverage', () => {
		const issues = collectAlluvialPayloadIntegrityIssues(
			basePayload({
				data: [{ source: 'a.ts', target: 'ghost', value: 0 }],
				nodeRank: { 'a.ts': 0 }, // b.ts missing rank
				scale: { 'a.ts': '#111' }, // b.ts missing color
				nodeRef: { 'a.ts': { kind: 'file', id: 'a.ts' } }, // b.ts missing ref
			}),
		);
		expect(issues.some((i) => i.includes('ghost'))).toBe(true);
		expect(issues.some((i) => i.includes('non-positive'))).toBe(true);
		expect(issues.some((i) => i.includes('nodeRank'))).toBe(true);
		expect(issues.some((i) => i.includes('color.scale'))).toBe(true);
		expect(issues.some((i) => i.includes('nodeRef'))).toBe(true);
	});

	it('flags pair resolution and rail endpoints', () => {
		const rail = '\u200b·in-rail·h1';
		const issues = collectAlluvialPayloadIntegrityIssues(
			basePayload({
				nodes: [
					{ name: 'a.ts', category: 'File', rank: 0 },
					{ name: 'pkg', category: 'External', rank: 0 },
					{ name: rail, category: 'Imports', rank: 1 },
				],
				data: [
					{ source: 'a.ts', target: rail, value: 1 },
					{ source: rail, target: 'pkg', value: 1 },
				],
				nodeRef: {
					'a.ts': { kind: 'file', id: 'a.ts' },
					pkg: { kind: 'package', id: 'pkg' },
					[rail]: { kind: 'file', id: 'bad-rail' }, // should be bucket
				},
				nodeRank: { 'a.ts': 0, pkg: 0, [rail]: 1 },
				scale: { 'a.ts': '#1', pkg: '#2', [rail]: '#3' },
				pairs: [
					{ parent: 'missing', packageName: 'pkg', width: 1 },
					{ parent: 'a.ts', packageName: rail, width: 0 },
				],
			}),
		);
		expect(issues.some((i) => i.includes('pair parent'))).toBe(true);
		expect(issues.some((i) => i.includes('rail endpoint'))).toBe(true);
		expect(issues.some((i) => i.includes('non-positive width'))).toBe(true);
		expect(issues.some((i) => i.includes('expected bucket'))).toBe(true);
	});

	it('assertAlluvialPayloadIntegrity throws path via expect on bad payload', () => {
		expect(() =>
			assertAlluvialPayloadIntegrity(
				basePayload({ data: [{ source: 'a.ts', target: 'a.ts', value: 1 }] }),
				'bad',
			),
		).toThrow();
	});
});

describe('focus graph rail exclusion', () => {
	it('collectFocusGraphRailIssues flags rails in file/package sets', () => {
		const rail = '\u200b·in-rail·h1';
		const issues = collectFocusGraphRailIssues({
			fileNodes: new Set(['a.ts', rail]),
			packageNodes: new Set(['pkg']),
		});
		expect(issues.some((i) => i.includes(rail))).toBe(true);
	});

	it('healthy file-hub payload: integrity + LogicalFocusGraph has no rails', () => {
		const { graph } = indexFiles([
			{
				path: 'focus.ts',
				content: "import './dep';\nimport 'zod';\nexport const f = 1;\n",
				byteLength: 50,
			},
			{
				path: 'dep.ts',
				content: 'export const d = 1;\n',
				byteLength: 20,
			},
			{
				path: 'package.json',
				content: JSON.stringify({ dependencies: { zod: '3' } }),
				byteLength: 40,
			},
		]);
		const payload = projectFileHub(graph, 'focus.ts', {
			maxDepth: 2,
			weightAxis: 'import-edges',
		});
		expect(payload).not.toBeNull();
		assertAlluvialPayloadIntegrity(payload!, 'focus.ts hub');
		const lfg = buildLogicalFocusGraph(payload!);
		assertFocusGraphNoRails(lfg, 'focus.ts lfg');
	});
});
