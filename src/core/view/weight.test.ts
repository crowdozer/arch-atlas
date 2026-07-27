import { describe, expect, it } from 'vitest';
import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	edgeWeight,
	fileLineCount,
	hubReverseEdgeWeight,
	lineCount,
	normalizeExactSurfaceMass,
	resolveWeightAxis,
	resolveWeightRequest,
	unitsForAxis,
	type WeightAxis,
} from '@core/view/weight.ts';

function edge(partial: Partial<ImportEdge> & Pick<ImportEdge, 'from' | 'to' | 'toKind'>): ImportEdge {
	return {
		id: `${partial.from}->${partial.to}`,
		kind: 'imports',
		specifier: partial.specifier ?? partial.to,
		epistemic: 'observed',
		form: 'import',
		line: 1,
		bindings: [{ kind: 'side-effect' }],
		...partial,
	};
}

function tinyGraph(): CodeGraph {
	const { graph } = indexFiles([
		{
			path: 'a.ts',
			// 3 lines
			content: "import './b';\nimport 'zod';\nexport const a = 1;\n",
			byteLength: 50,
		},
		{
			path: 'b.ts',
			// 2 lines (no trailing newline after last)
			content: "export const b = 2;\n// end",
			byteLength: 30,
		},
	]);
	return graph;
}

describe('lineCount', () => {
	it('returns 0 for empty', () => {
		expect(lineCount('')).toBe(0);
	});

	it('counts single line without newline', () => {
		expect(lineCount('hello')).toBe(1);
	});

	it('counts trailing newline as no extra empty line', () => {
		// "a\nb\n" → lines a, b → 2
		expect(lineCount('a\nb\n')).toBe(2);
	});

	it('counts non-empty trailing content after last newline', () => {
		expect(lineCount('a\nb')).toBe(2);
		expect(lineCount('a\nb\nc')).toBe(3);
	});
});

describe('edgeWeight matrix', () => {
	const graph = tinyGraph();
	const fileEdge = edge({ from: 'a.ts', to: 'b.ts', toKind: 'file', specifier: './b' });
	const pkgEdge = edge({ from: 'a.ts', to: 'zod', toKind: 'package', specifier: 'zod' });
	const axes: WeightAxis[] = ['import-edges', 'importer-loc', 'target-loc'];

	it('import-edges is always 1 for file and package', () => {
		expect(edgeWeight(fileEdge, graph, 'import-edges')).toBe(1);
		expect(edgeWeight(pkgEdge, graph, 'import-edges')).toBe(1);
	});

	it('importer-loc uses LOC of from (min 1)', () => {
		const aLoc = fileLineCount(graph, 'a.ts');
		expect(aLoc).toBeGreaterThan(1);
		expect(edgeWeight(fileEdge, graph, 'importer-loc')).toBe(aLoc);
		expect(edgeWeight(pkgEdge, graph, 'importer-loc')).toBe(aLoc);
	});

	it('target-loc uses LOC of file targets; packages fall back to 1', () => {
		const bLoc = fileLineCount(graph, 'b.ts');
		expect(bLoc).toBeGreaterThan(0);
		expect(edgeWeight(fileEdge, graph, 'target-loc')).toBe(bLoc);
		expect(edgeWeight(pkgEdge, graph, 'target-loc')).toBe(1);
	});

	it('unresolved under target-loc falls back to 1', () => {
		const u = edge({
			from: 'a.ts',
			to: 'unresolved:./missing',
			toKind: 'unresolved',
			specifier: './missing',
		});
		expect(edgeWeight(u, graph, 'target-loc')).toBe(1);
	});

	it('covers all three axes for file vs package', () => {
		for (const axis of axes) {
			const fw = edgeWeight(fileEdge, graph, axis);
			const pw = edgeWeight(pkgEdge, graph, axis);
			expect(fw).toBeGreaterThan(0);
			expect(pw).toBeGreaterThan(0);
			if (axis === 'import-edges') {
				expect(fw).toBe(1);
				expect(pw).toBe(1);
			}
			if (axis === 'target-loc') {
				expect(pw).toBe(1);
				expect(fw).toBe(fileLineCount(graph, 'b.ts'));
			}
			if (axis === 'importer-loc') {
				expect(fw).toBe(pw);
			}
		}
	});

	it('missing content yields min-1 for importer-loc', () => {
		const e = edge({ from: 'missing.ts', to: 'zod', toKind: 'package' });
		expect(edgeWeight(e, graph, 'importer-loc')).toBe(1);
	});

	it('exact + target-loc uses surface mass (never whole-file)', () => {
		const bLoc = fileLineCount(graph, 'b.ts');
		expect(bLoc).toBeGreaterThan(1);
		const surface = { targetSurfaceMass: () => 2 };
		expect(
			edgeWeight(fileEdge, graph, 'target-loc', {
				precision: 'exact',
				surface,
			}),
		).toBe(2);
		// null mass → 1, not whole-file
		const nullSurface = { targetSurfaceMass: () => null };
		expect(
			edgeWeight(fileEdge, graph, 'target-loc', {
				precision: 'exact',
				surface: nullSurface,
			}),
		).toBe(1);
		// package still 1 under exact
		expect(
			edgeWeight(pkgEdge, graph, 'target-loc', {
				precision: 'exact',
				surface,
			}),
		).toBe(1);
	});

	it('hubReverseEdgeWeight differentiates reverse edges under target-loc', () => {
		// Two importers of the same target (focus) — plain edgeWeight shares target LOC
		const e1 = edge({
			from: 'a.ts',
			to: 'b.ts',
			toKind: 'file',
			bindings: [{ kind: 'named', imported: 'x', local: 'x' }],
		});
		const e2 = edge({
			from: 'missing-importer.ts', // no content → importer loc 1
			to: 'b.ts',
			toKind: 'file',
			bindings: [{ kind: 'side-effect' }],
		});
		const bLoc = fileLineCount(graph, 'b.ts');
		expect(edgeWeight(e1, graph, 'target-loc')).toBe(bLoc);
		expect(edgeWeight(e2, graph, 'target-loc')).toBe(bLoc);

		// estimate reverse: importer LOC (a.ts vs missing)
		const aLoc = fileLineCount(graph, 'a.ts');
		expect(hubReverseEdgeWeight(e1, graph, 'target-loc')).toBe(aLoc);
		expect(hubReverseEdgeWeight(e2, graph, 'target-loc')).toBe(1);
		expect(hubReverseEdgeWeight(e1, graph, 'target-loc')).not.toBe(
			hubReverseEdgeWeight(e2, graph, 'target-loc'),
		);

		// exact reverse: surface when present
		const surface = {
			targetSurfaceMass: (_g: typeof graph, e: typeof e1) =>
				e.from === 'a.ts' ? 7 : null,
		};
		expect(
			hubReverseEdgeWeight(e1, graph, 'target-loc', {
				precision: 'exact',
				surface,
			}),
		).toBe(7);
		// null surface → importer LOC, not flat 1 when importer has LOC
		expect(
			hubReverseEdgeWeight(e1, graph, 'target-loc', {
				precision: 'exact',
				surface: { targetSurfaceMass: () => null },
			}),
		).toBe(aLoc);
	});

	it('estimate still uses whole-file when surface is present', () => {
		const bLoc = fileLineCount(graph, 'b.ts');
		const surface = { targetSurfaceMass: () => 99 };
		expect(
			edgeWeight(fileEdge, graph, 'target-loc', {
				precision: 'estimate',
				surface,
			}),
		).toBe(bLoc);
	});

	it('exact without surface never uses whole-file (defense-in-depth → 1)', () => {
		const bLoc = fileLineCount(graph, 'b.ts');
		expect(bLoc).toBeGreaterThan(1);
		expect(
			edgeWeight(fileEdge, graph, 'target-loc', {
				precision: 'exact',
			}),
		).toBe(1);
		expect(
			edgeWeight(fileEdge, graph, 'target-loc', {
				precision: 'exact',
				surface: null,
			}),
		).toBe(1);
	});
});

describe('normalizeExactSurfaceMass', () => {
	it('maps null/0/negative to 1 and floors positives', () => {
		expect(normalizeExactSurfaceMass(null)).toBe(1);
		expect(normalizeExactSurfaceMass(undefined)).toBe(1);
		expect(normalizeExactSurfaceMass(0)).toBe(1);
		expect(normalizeExactSurfaceMass(-3)).toBe(1);
		expect(normalizeExactSurfaceMass(3.9)).toBe(3);
		expect(normalizeExactSurfaceMass(1)).toBe(1);
	});
});

describe('unitsForAxis', () => {
	it('preserves legacy labels on import-edges', () => {
		expect(unitsForAxis('import-edges', 'package-mass')).toBe('package imports');
		expect(unitsForAxis('import-edges', 'import-edges')).toBe('import edges');
	});

	it('LOC units name importer vs imported (target) file size honestly', () => {
		expect(unitsForAxis('importer-loc')).toMatch(/importer file/i);
		expect(unitsForAxis('target-loc')).toMatch(/imported LOC/i);
		// Dual-side: imports use target file; exports use importer file
		expect(unitsForAxis('target-loc')).toMatch(/target file/i);
		expect(unitsForAxis('target-loc')).toMatch(/importer file/i);
	});

	it('exact target-loc units name surface honesty', () => {
		const u = unitsForAxis('target-loc', 'import-edges', 'exact');
		expect(u).toMatch(/surface/i);
		expect(u).not.toMatch(/whole file/i);
	});
});

describe('resolveWeightAxis', () => {
	it('defaults to target-loc (UI “Imported LOC”)', () => {
		expect(resolveWeightAxis()).toBe('target-loc');
		expect(resolveWeightAxis(undefined)).toBe('target-loc');
	});
});

describe('resolveWeightRequest', () => {
	it('allows estimate for all axes', () => {
		for (const axis of ['import-edges', 'importer-loc', 'target-loc'] as WeightAxis[]) {
			const r = resolveWeightRequest(axis, 'estimate');
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.axis).toBe(axis);
		}
	});

	it('exact + target-loc is not implemented without provider', () => {
		const r = resolveWeightRequest('target-loc', 'exact');
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.reason).toBe('exact-not-implemented');
			expect(r.message).toMatch(/language server/i);
		}
	});

	it('exact + target-loc is ok when ImportedSurfaceProvider present', () => {
		const surface = {
			targetSurfaceMass: () => 3,
		};
		const r = resolveWeightRequest('target-loc', 'exact', surface);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.axis).toBe('target-loc');
			expect(r.precision).toBe('exact');
		}
	});

	it('exact + target-loc still fails when surface is null', () => {
		const r = resolveWeightRequest('target-loc', 'exact', null);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('exact-not-implemented');
	});

	it('exact + import-edges is ok (no imported-surface claim)', () => {
		const r = resolveWeightRequest('import-edges', 'exact');
		expect(r.ok).toBe(true);
	});

	it('exact + importer-loc is ok (whole-file importer size)', () => {
		const r = resolveWeightRequest('importer-loc', 'exact');
		expect(r.ok).toBe(true);
	});
});
