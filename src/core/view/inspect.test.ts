import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import {
	callSitesForEdge,
	edgesForBand,
	edgesForNode,
	evidenceForEdges,
	importedCodeForEdge,
	snippetsForEdges,
	statementSpan,
} from '@core/view/inspect.ts';

const sample = [
	{
		path: 'src/main.ts',
		content: `import { x } from './lib/util';\nimport zod from 'zod';\nconst y = x + 1;\nconsole.log(x);\n`,
		byteLength: 0,
	},
	{
		path: 'src/lib/util.ts',
		content: `export const x = 1;\nimport 'react';\nexport function helper() {\n  return x;\n}\n`,
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

	it('stores line numbers and bindings on edges', () => {
		const zod = graph.edges.find((e) => e.specifier === 'zod');
		expect(zod?.line).toBe(2);
		expect(zod?.from).toBe('src/main.ts');
		expect(zod?.bindings.some((b) => b.kind === 'default' && b.local === 'zod')).toBe(
			true,
		);

		const util = graph.edges.find((e) => e.specifier.includes('util'));
		expect(util?.bindings).toEqual([
			{ kind: 'named', imported: 'x', local: 'x' },
		]);
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
		expect(snips[0]!.endLine).toBe(2);
		expect(snips[0]!.text).toContain('zod');
		expect(snips[0]!.path).toBe('src/main.ts');
	});

	it('multi-line import statement expands full clause (not just import {)', () => {
		const multi = [
			{
				path: 'client/savegame/savegame.ts',
				content: `import type {
  AimInput,
  AlienShip,
  Vec2,
  WeaponType,
} from '../sim/types';
export type SavePath = Vec2[];
const aim: AimInput | null = null;
`,
				byteLength: 0,
			},
			{
				path: 'client/sim/types.ts',
				content: `export type AimInput = { x: number };
export type AlienShip = { id: string };
export type Vec2 = { x: number; y: number };
export type WeaponType = 'laser';
`,
				byteLength: 0,
			},
		];
		const g = buildGraph(multi);
		const edge = g.edges.find((e) => e.from.includes('savegame'))!;
		expect(edge).toBeTruthy();
		expect(edge.line).toBe(1);

		const span = statementSpan(
			g.contents.get(edge.from)!,
			edge.line,
			edge.form,
			edge.specifier,
		);
		expect(span.text).toContain('AimInput');
		expect(span.text).toContain('WeaponType');
		expect(span.text).toContain("from '../sim/types'");
		expect(span.text).not.toMatch(/^import type \{\s*$/);
		expect(span.endLine).toBeGreaterThan(span.startLine);

		const [ev] = evidenceForEdges(g, [edge], 'estimate');
		expect(ev!.import.text).toContain('AimInput');
		expect(ev!.import.endLine).toBe(span.endLine);
		// Binding lines inside the import clause must not be callsites
		const clauseLines = new Set(
			Array.from(
				{ length: span.endLine - span.startLine + 1 },
				(_, i) => span.startLine + i,
			),
		);
		expect(ev!.callsites.every((c) => !clauseLines.has(c.line))).toBe(true);
		// Real use outside the clause still counts
		expect(ev!.callsites.some((c) => c.symbol === 'AimInput')).toBe(true);
		expect(ev!.callsites.some((c) => c.symbol === 'Vec2')).toBe(true);
	});

	it('statementSpan keeps single-line imports on one line', () => {
		const src = "import { x } from './lib/util';\nconst y = x;\n";
		const span = statementSpan(src, 1, 'import', './lib/util');
		expect(span.startLine).toBe(1);
		expect(span.endLine).toBe(1);
		expect(span.text).toBe("import { x } from './lib/util';");
	});

	it('file→file reverse band', () => {
		const edges = edgesForBand(
			graph,
			{ kind: 'file', id: 'src/lib/util.ts' },
			{ kind: 'file', id: 'src/main.ts' },
		);
		expect(edges.some((e) => e.specifier.includes('util'))).toBe(true);
	});

	it('importedCodeForEdge returns whole-file estimate for file targets', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const code = importedCodeForEdge(graph, util);
		expect(code).toBeTruthy();
		expect(code!.path).toBe('src/lib/util.ts');
		expect(code!.text).toContain('export const x');
		expect(code!.note).toMatch(/whole file/i);
	});

	it('callSitesForEdge finds local uses of named import', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const sites = callSitesForEdge(graph, util);
		expect(sites.length).toBeGreaterThanOrEqual(2);
		expect(sites.every((s) => s.symbol === 'x')).toBe(true);
		expect(sites.every((s) => s.line !== util.line)).toBe(true);
	});

	it('evidenceForEdges estimate includes import + code + callsites', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const [ev] = evidenceForEdges(graph, [util], 'estimate');
		expect(ev).toBeTruthy();
		expect(ev!.import.text).toContain('util');
		expect(ev!.importedCode?.text).toContain('export const x');
		expect(ev!.callsites.length).toBeGreaterThan(0);
		expect(ev!.blockers.some((b) => b.code === 'exact-not-implemented')).toBe(false);
	});

	it('evidenceForEdges exact withholds imported surface and callsites', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const [ev] = evidenceForEdges(graph, [util], 'exact');
		expect(ev!.import.text).toContain('util');
		expect(ev!.importedCode).toBeUndefined();
		expect(ev!.callsites).toHaveLength(0);
		expect(ev!.blockers.some((b) => b.code === 'exact-not-implemented')).toBe(true);
	});

	it('evidenceForEdges exact with mock provider returns surface and callsites', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const mock = {
			targetSurfaceMass: () => 2,
			importedSurface: () => ({
				text: 'export const x = 1; // exact surface',
				note: 'exact imported surface (mock)',
				startLine: 10,
				endLine: 12,
			}),
			callSites: () => [
				{
					epistemic: 'inferred' as const,
					path: 'src/main.ts',
					line: 3,
					text: 'const y = x + 1;',
					symbol: 'x',
				},
			],
		};
		const [ev] = evidenceForEdges(graph, [util], 'exact', mock);
		expect(ev!.import.text).toContain('util');
		expect(ev!.importedCode?.text).toContain('exact surface');
		expect(ev!.importedCode?.note).toMatch(/exact/i);
		// Prefer provider file line range over excerpt-relative 1..n
		expect(ev!.importedCode?.startLine).toBe(10);
		expect(ev!.importedCode?.endLine).toBe(12);
		expect(ev!.callsites).toHaveLength(1);
		expect(ev!.callsites[0]!.symbol).toBe('x');
		expect(ev!.blockers.some((b) => b.code === 'exact-not-implemented')).toBe(
			false,
		);
	});

	it('evidenceForEdges exact with mass-only provider uses surface-unresolved (not engine-missing)', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const massOnly = {
			targetSurfaceMass: () => 2,
			// no importedSurface / callSites — withhold, do not invent estimate surface
		};
		const [ev] = evidenceForEdges(graph, [util], 'exact', massOnly);
		expect(ev!.import.text).toContain('util');
		expect(ev!.importedCode).toBeUndefined();
		expect(ev!.callsites).toHaveLength(0);
		expect(ev!.blockers.some((b) => b.code === 'exact-surface-unresolved')).toBe(
			true,
		);
		expect(ev!.blockers.some((b) => b.code === 'exact-not-implemented')).toBe(
			false,
		);
		expect(ev!.blockers.find((b) => b.code === 'exact-surface-unresolved')?.message).toMatch(
			/export surface not resolved/i,
		);
	});

	it('evidenceForEdges exact with null importedSurface uses surface-unresolved', () => {
		const util = graph.edges.find((e) => e.specifier.includes('util'))!;
		const nullSurface = {
			targetSurfaceMass: () => 2,
			importedSurface: () => null,
		};
		const [ev] = evidenceForEdges(graph, [util], 'exact', nullSurface);
		expect(ev!.import.text).toContain('util');
		expect(ev!.importedCode).toBeUndefined();
		expect(ev!.blockers.some((b) => b.code === 'exact-surface-unresolved')).toBe(
			true,
		);
		expect(ev!.blockers.some((b) => b.code === 'exact-not-implemented')).toBe(
			false,
		);
	});
});

describe('inspect module keys match importerGroupKey deepen', () => {
	// Ten files under client/ import hub.ts → projector uses client/(files)
	const fanIn = [
		{
			path: 'client/hub.ts',
			content: `export const hub = 1;\n`,
			byteLength: 0,
		},
		...Array.from({ length: 10 }, (_, i) => ({
			path: `client/file${i}.ts`,
			content: `import { hub } from './hub';\nexport const n${i} = hub;\n`,
			byteLength: 0,
		})),
	];

	it('module → file band recovers file→file edges for client/(files)', () => {
		const g = buildGraph(fanIn);
		const edges = edgesForBand(
			g,
			{ kind: 'module', id: 'client/(files)' },
			{ kind: 'file', id: 'client/hub.ts' },
		);
		expect(edges.length).toBe(10);
		expect(edges.every((e) => e.to === 'client/hub.ts')).toBe(true);
		expect(edges.every((e) => e.from.startsWith('client/file'))).toBe(true);
	});

	it('edgesForNode module uses (files) heuristic without peers', () => {
		const withPkg = [
			{
				path: 'client/hub.ts',
				content: `export const hub = 1;\n`,
				byteLength: 0,
			},
			...Array.from({ length: 10 }, (_, i) => ({
				path: `client/file${i}.ts`,
				content:
					i === 0
						? `import { hub } from './hub';\nimport z from 'zod';\nexport const n0 = hub;\n`
						: `import { hub } from './hub';\nexport const n${i} = hub;\n`,
				byteLength: 0,
			})),
			{
				path: 'package.json',
				content: `{"dependencies":{"zod":"3"}}`,
				byteLength: 0,
			},
		];
		const g2 = buildGraph(withPkg);
		const pkgEdges = edgesForNode(g2, { kind: 'module', id: 'client/(files)' });
		expect(pkgEdges.some((e) => e.specifier === 'zod')).toBe(true);
	});
});
