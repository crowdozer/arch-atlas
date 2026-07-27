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

/** Pad content so whole-file LOC is at least `lines` (including trailing newline). */
function padLines(body: string, lines: number): string {
	const base = body.endsWith('\n') ? body : `${body}\n`;
	const have = base.split('\n').length - (base.endsWith('\n') ? 1 : 0);
	// fileLineCount is newline-based; ensure enough lines
	const need = Math.max(0, lines - have);
	return base + '\n'.repeat(need);
}

describe('catalogGodfiles', () => {
	it('ranks multi-signal hubs above single-axis busy files', () => {
		// Hub: high in + high out + multi-domain neighbors
		// Leaf barrel: high out only, short — ranks below long multi-signal hub
		// Fan-in only leaf: high in, no out — now eligible if it imports nothing:
		//   pure in-only still has out=0 but inn>=1 → eligible; score lower than hub
		const { graph, catalog } = indexFiles(
			files([
				['tsconfig.json', '{ "compilerOptions": {} }\n'],
				// domain A
				[
					'src/api/hub.ts',
					padLines(
						[
							"import { a } from '../svc/a';",
							"import { b } from '../svc/b';",
							"import { c } from '../domain/c';",
							"import { d } from '../util/d';",
							'export const hub = () => a() + b() + c() + d();',
						].join('\n'),
						40,
					),
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
				// single-axis: out only (barrel), short
				[
					'src/api/barrel.ts',
					[
						"export { a } from '../svc/a';",
						"export { b } from '../svc/b';",
						"export { c } from '../domain/c';",
					].join('\n') + '\n',
				],
				// single-axis: in only, short
				['src/domain/popular.ts', 'export const popular = 1;\n'],
				[
					'src/ui/usesPopular.ts',
					"import { popular } from '../domain/popular';\nvoid popular;\n",
				],
				// same-folder bus: in+out but fewer domains, short
				[
					'src/api/localBus.ts',
					"import { a } from './localLeaf';\nexport const localBus = a;\n",
				],
				['src/api/localLeaf.ts', 'export const a = 1;\n'],
				[
					'src/api/localUser.ts',
					"import { localBus } from './localBus';\nvoid localBus;\n",
				],
			]),
		);

		const ranked = catalogGodfiles(graph);
		expect(ranked.length).toBeGreaterThan(0);
		// Hub should top the list
		expect(ranked[0]!.path).toBe('src/api/hub.ts');
		expect(ranked[0]!.inDegree).toBeGreaterThanOrEqual(3);
		expect(ranked[0]!.outDegree).toBeGreaterThanOrEqual(4);
		expect(ranked[0]!.domainsTouched).toBeGreaterThan(1);
		expect(ranked[0]!.loc).toBeGreaterThan(0);
		expect(ranked[0]!.score).toBe(
			(ranked[0]!.inDegree + 1) *
				(ranked[0]!.outDegree + 1) *
				Math.max(1, ranked[0]!.domainsTouched) *
				Math.max(1, ranked[0]!.loc),
		);
		expect(ranked[0]!.epistemic).toBe('inferred');

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

	it('ranks long composition roots (high out, zero in) like pre-refactor app.ts', () => {
		// Controller: many imports, nobody imports it, huge LOC
		const longBody = padLines(
			[
				"import { a } from '../lib/a';",
				"import { b } from '../lib/b';",
				"import { c } from '../ui/c';",
				"import { d } from '../svc/d';",
				'export function boot() { a(); b(); c(); d(); }',
			].join('\n'),
			200,
		);
		const { graph } = indexFiles(
			files([
				['src/client/app.ts', longBody],
				['src/lib/a.ts', 'export const a = () => 1;\n'],
				['src/lib/b.ts', 'export const b = () => 2;\n'],
				['src/ui/c.ts', 'export const c = () => 3;\n'],
				['src/svc/d.ts', 'export const d = () => 4;\n'],
				// small dual-axis peer that old formula would prefer without LOC
				[
					'src/mid/bridge.ts',
					"import { a } from '../lib/a';\nexport const bridge = a;\n",
				],
				['src/mid/user.ts', "import { bridge } from './bridge';\nvoid bridge;\n"],
			]),
		);

		const ranked = catalogGodfiles(graph);
		const app = ranked.find((r) => r.path === 'src/client/app.ts');
		expect(app).toBeDefined();
		expect(app!.inDegree).toBe(0);
		expect(app!.outDegree).toBeGreaterThanOrEqual(4);
		expect(app!.loc).toBeGreaterThanOrEqual(200);
		// Long root should rank at or near the top
		expect(ranked[0]!.path).toBe('src/client/app.ts');
	});

	it('skips non-source and files with no import edges', () => {
		const { graph } = indexFiles(
			files([
				['readme.md', '# hi\n'],
				['src/orphan.ts', 'export const x = 1;\n'],
			]),
		);
		const ranked = catalogGodfiles(graph);
		expect(ranked.every((r) => r.path.endsWith('.ts'))).toBe(true);
		expect(ranked.find((r) => r.path === 'src/orphan.ts')).toBeUndefined();
	});

	it('sorts by score then edge mass then loc then path', () => {
		const { graph } = indexFiles(
			files([
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
					prev.loc > cur.loc) ||
				(prev.score === cur.score &&
					prevMass === curMass &&
					prev.loc === cur.loc &&
					prev.path.localeCompare(cur.path) <= 0);
			expect(orderOk).toBe(true);
		}
	});
});
