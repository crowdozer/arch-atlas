import { describe, expect, it } from 'vitest';
import { catalogGodfiles } from '@core/catalog/godfiles.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogGodfiles', () => {
	it('ranks multi-signal hubs above single-axis busy files', () => {
		// Hub: high in + high out + multi-domain neighbors
		// Leaf barrel: high out only (no in) → excluded
		// Fan-in only leaf: high in, no out → excluded
		// Same-domain bus: in+out but domainsTouched small
		const { graph, catalog } = indexFiles(
			files([
				['tsconfig.json', '{ "compilerOptions": {} }\n'],
				// domain A
				[
					'src/api/hub.ts',
					[
						"import { a } from '../svc/a';",
						"import { b } from '../svc/b';",
						"import { c } from '../domain/c';",
						"import { d } from '../util/d';",
						'export const hub = () => a() + b() + c() + d();',
					].join('\n') + '\n',
				],
				// domain B importers of hub
				['src/ui/page.ts', "import { hub } from '../api/hub';\nhub();\n"],
				['src/ui/widget.ts', "import { hub } from '../api/hub';\nhub();\n"],
				['src/app/main.ts', "import { hub } from '../api/hub';\nhub();\n"],
				// neighbors hub imports
				['src/svc/a.ts', 'export const a = () => 1;\n'],
				['src/svc/b.ts', 'export const b = () => 2;\n'],
				['src/domain/c.ts', 'export const c = () => 3;\n'],
				['src/util/d.ts', 'export const d = () => 4;\n'],
				// single-axis: out only (barrel)
				[
					'src/api/barrel.ts',
					[
						"export { a } from '../svc/a';",
						"export { b } from '../svc/b';",
						"export { c } from '../domain/c';",
					].join('\n') + '\n',
				],
				// single-axis: in only
				['src/domain/popular.ts', 'export const popular = 1;\n'],
				['src/ui/usesPopular.ts', "import { popular } from '../domain/popular';\nvoid popular;\n"],
				// same-folder bus: in+out but fewer domains
				[
					'src/api/localBus.ts',
					"import { a } from './localLeaf';\nexport const localBus = a;\n",
				],
				['src/api/localLeaf.ts', 'export const a = 1;\n'],
				['src/api/localUser.ts', "import { localBus } from './localBus';\nvoid localBus;\n"],
			]),
		);

		const ranked = catalogGodfiles(graph);
		expect(ranked.length).toBeGreaterThan(0);
		// Hub should top the list
		expect(ranked[0]!.path).toBe('src/api/hub.ts');
		expect(ranked[0]!.inDegree).toBeGreaterThanOrEqual(3);
		expect(ranked[0]!.outDegree).toBeGreaterThanOrEqual(4);
		expect(ranked[0]!.domainsTouched).toBeGreaterThan(1);
		expect(ranked[0]!.score).toBe(
			ranked[0]!.inDegree *
				ranked[0]!.outDegree *
				Math.max(1, ranked[0]!.domainsTouched),
		);
		expect(ranked[0]!.epistemic).toBe('inferred');

		// Barrel (out only) and popular (in only) excluded
		expect(ranked.find((r) => r.path === 'src/api/barrel.ts')).toBeUndefined();
		expect(ranked.find((r) => r.path === 'src/domain/popular.ts')).toBeUndefined();

		// Multi-domain hub beats same-folder localBus on score
		const local = ranked.find((r) => r.path === 'src/api/localBus.ts');
		if (local) {
			expect(ranked[0]!.score).toBeGreaterThan(local.score);
		}

		// Wired into map catalog
		expect(catalog.godfiles.length).toBeGreaterThan(0);
		expect(catalog.godfiles[0]!.path).toBe(ranked[0]!.path);
		expect(catalog.godfiles[0]!.score).toBe(ranked[0]!.score);
	});

	it('skips non-source and files with in=0 or out=0', () => {
		const { graph } = indexFiles(
			files([
				['readme.md', '# hi\n'],
				['src/onlyOut.ts', "import { x } from './leaf';\nexport const y = x;\n"],
				['src/leaf.ts', 'export const x = 1;\n'],
			]),
		);
		const ranked = catalogGodfiles(graph);
		expect(ranked.every((r) => r.path.endsWith('.ts'))).toBe(true);
		// onlyOut has out but no importers; leaf has in but no out
		expect(ranked).toHaveLength(0);
	});

	it('sorts by score then edge mass then path', () => {
		const { graph } = indexFiles(
			files([
				// Two hubs with controlled degrees
				['src/a/h1.ts', "import { x } from '../b/x';\nexport const h1 = x;\n"],
				['src/a/h2.ts', "import { x } from '../b/x';\nexport const h2 = x;\n"],
				['src/b/x.ts', 'export const x = 1;\n'],
				['src/c/u1.ts', "import { h1 } from '../a/h1';\nvoid h1;\n"],
				['src/c/u2.ts', "import { h1 } from '../a/h1';\nvoid h1;\n"],
				['src/c/u3.ts', "import { h2 } from '../a/h2';\nvoid h2;\n"],
			]),
		);
		const ranked = catalogGodfiles(graph);
		for (let i = 1; i < ranked.length; i++) {
			const prev = ranked[i - 1]!;
			const cur = ranked[i]!;
			const prevMass = prev.inDegree + prev.outDegree;
			const curMass = cur.inDegree + cur.outDegree;
			const orderOk =
				prev.score > cur.score ||
				(prev.score === cur.score && prevMass > curMass) ||
				(prev.score === cur.score &&
					prevMass === curMass &&
					prev.path.localeCompare(cur.path) <= 0);
			expect(orderOk).toBe(true);
		}
	});
});
