import { describe, expect, it } from 'vitest';
import {
	catalogSpines,
	rankSpineRows,
	spineMetrics,
} from '@core/catalog/spines.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogSpines', () => {
	it('ranks multi-module importers above single-folder fan-in under modules-then-in', () => {
		// spine: imported from client/sim, client/render, server/api (3 modules)
		// hub: imported thrice from client/lib only (1 module, high inDegree)
		const { graph, catalog } = indexFiles(
			files([
				['shared/spine.ts', 'export const spine = 1;\n'],
				['client/sim/a.ts', "import { spine } from '../../shared/spine';\nvoid spine;\n"],
				['client/render/b.ts', "import { spine } from '../../shared/spine';\nvoid spine;\n"],
				['server/api/c.ts', "import { spine } from '../../shared/spine';\nvoid spine;\n"],
				['shared/hub.ts', 'export const hub = 1;\n'],
				['client/lib/x1.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
				['client/lib/x2.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
				['client/lib/x3.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
				['client/lib/x4.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
			]),
		);

		const ranked = catalogSpines(graph, 15, 'modules-then-in');
		const byPath = new Map(ranked.map((r) => [r.path, r]));

		const spine = byPath.get('shared/spine.ts');
		expect(spine).toBeDefined();
		expect(spine!.importerModuleCount).toBeGreaterThanOrEqual(3);
		expect(spine!.inDegree).toBe(3);

		// hub has 4 importers but one module → soft floor excludes under modules-then-in
		expect(byPath.has('shared/hub.ts')).toBe(false);

		// Wired into map catalog with default formula
		expect(catalog.spines.length).toBeGreaterThan(0);
		expect(catalog.spineFormula).toBe('modules-then-in');
		expect(catalog.spines[0]!.path).toBe('shared/spine.ts');
	});

	it('fan-in includes single-module hubs and ranks by inDegree', () => {
		const { graph } = indexFiles(
			files([
				['shared/spine.ts', 'export const spine = 1;\n'],
				['client/sim/a.ts', "import { spine } from '../../shared/spine';\nvoid spine;\n"],
				['client/render/b.ts', "import { spine } from '../../shared/spine';\nvoid spine;\n"],
				['shared/hub.ts', 'export const hub = 1;\n'],
				['client/lib/x1.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
				['client/lib/x2.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
				['client/lib/x3.ts', "import { hub } from '../../shared/hub';\nvoid hub;\n"],
			]),
		);

		const fanIn = catalogSpines(graph, 15, 'fan-in');
		expect(fanIn[0]!.path).toBe('shared/hub.ts');
		expect(fanIn[0]!.inDegree).toBe(3);

		const modules = catalogSpines(graph, 15, 'modules-then-in');
		expect(modules[0]!.path).toBe('shared/spine.ts');
	});

	it('formula order differs: composite vs modules-then-in', () => {
		const { graph } = indexFiles(
			files([
				// A: 2 modules, 5 importers → composite 10, modules 2
				['lib/a.ts', 'export const a = 1;\n'],
				['m1/p1.ts', "import { a } from '../lib/a';\nvoid a;\n"],
				['m1/p2.ts', "import { a } from '../lib/a';\nvoid a;\n"],
				['m1/p3.ts', "import { a } from '../lib/a';\nvoid a;\n"],
				['m2/q1.ts', "import { a } from '../lib/a';\nvoid a;\n"],
				['m2/q2.ts', "import { a } from '../lib/a';\nvoid a;\n"],
				// B: 3 modules × 1 each → composite 9, modules 3 (wins modules-then-in)
				['lib/b.ts', 'export const b = 1;\n'],
				['x1/u.ts', "import { b } from '../lib/b';\nvoid b;\n"],
				['x2/v.ts', "import { b } from '../lib/b';\nvoid b;\n"],
				['x3/w.ts', "import { b } from '../lib/b';\nvoid b;\n"],
			]),
		);

		const metrics = spineMetrics(graph);
		const byModules = rankSpineRows(metrics, 'modules-then-in', 10);
		const byComposite = rankSpineRows(metrics, 'composite', 10);

		expect(byModules[0]!.path).toBe('lib/b.ts');
		expect(byComposite[0]!.path).toBe('lib/a.ts');
		expect(byComposite[0]!.composite).toBe(10);
	});

	it('share ranks by inDegree/sourceCount', () => {
		const { graph } = indexFiles(
			files([
				['lib/big.ts', 'export const big = 1;\n'],
				['a/a1.ts', "import { big } from '../lib/big';\nvoid big;\n"],
				['b/b1.ts', "import { big } from '../lib/big';\nvoid big;\n"],
				['c/c1.ts', "import { big } from '../lib/big';\nvoid big;\n"],
				['lib/small.ts', 'export const small = 1;\n'],
				['d/d1.ts', "import { small } from '../lib/small';\nvoid small;\n"],
				['e/e1.ts', "import { small } from '../lib/small';\nvoid small;\n"],
			]),
		);
		const ranked = catalogSpines(graph, 15, 'share');
		expect(ranked[0]!.path).toBe('lib/big.ts');
		expect(ranked[0]!.inShare).toBeGreaterThan(ranked[1]!.inShare);
	});
});
