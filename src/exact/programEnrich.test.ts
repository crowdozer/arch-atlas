import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import {
	collectExportSymbolCounts,
	enrichGraphWithProgram,
	patchUnresolvedEdges,
} from './programEnrich.ts';
import { createFeedProgram, isProgramTypescriptModule } from './programHost.ts';
import { loadTypescript } from './loadTypescript.ts';

async function loadClassic() {
	const loaded = await loadTypescript({ skipCdn: true });
	if (!loaded.ok) throw new Error(loaded.error);
	if (!isProgramTypescriptModule(loaded.ts)) {
		throw new Error('local typescript is not Program-capable');
	}
	return loaded.ts;
}

describe('programEnrich', () => {
	it('patches unresolved alias edges when Program resolves into feed', async () => {
		const ts = await loadClassic();
		// Graph without tsconfig → L1 leaves @/… unresolved
		const files = [
			{
				path: 'client/main.ts',
				content: `import { formatTick } from '@/modules/artillery/client/util';\nexport const x = formatTick(1);\n`,
				byteLength: 80,
			},
			{
				path: 'client/util.ts',
				content: `export function formatTick(n: number): string { return String(n); }\n`,
				byteLength: 70,
			},
		];
		const graph = buildGraph(files);
		const unresolved = graph.edges.filter((e) => e.toKind === 'unresolved');
		expect(unresolved.length).toBeGreaterThan(0);
		expect(unresolved[0]?.unresolvedReason).toBe('alias');

		// Program gets tsconfig via extra contents map merge on contents
		const contents = new Map(graph.contents);
		contents.set(
			'tsconfig.json',
			JSON.stringify({
				compilerOptions: {
					baseUrl: '.',
					paths: { '@/modules/artillery/*': ['./*'] },
				},
			}),
		);
		const graphWithCfg = {
			...graph,
			contents,
		};

		const result = enrichGraphWithProgram(graphWithCfg, ts);
		expect(result.applied).toBe(true);
		expect(result.stats.resolvedCount).toBeGreaterThanOrEqual(1);
		expect(result.stats.resolvedAliasCount).toBeGreaterThanOrEqual(1);
		const edge = result.graph.edges.find((e) => e.from === 'client/main.ts');
		expect(edge?.toKind).toBe('file');
		expect(edge?.to).toBe('client/util.ts');
		expect(edge?.unresolvedReason).toBeUndefined();
	});

	it('collects thin L3 exportSymbolCount for exported symbols', async () => {
		const ts = await loadClassic();
		const files = new Map<string, string>([
			['util.ts', `export function foo() { return 1; }\nexport const bar = 2;\n`],
			['main.ts', `import { foo } from './util';\nexport const z = foo();\n`],
		]);
		const feed = createFeedProgram(files, ts);
		const counts = collectExportSymbolCounts(feed);
		expect(counts.get('util.ts')).toBeGreaterThanOrEqual(2);
		expect(counts.size).toBeGreaterThanOrEqual(1);
	});

	it('patchUnresolvedEdges is a no-op when already file-bound', async () => {
		const ts = await loadClassic();
		const files = [
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
		];
		const graph = buildGraph(files);
		expect(graph.edges.every((e) => e.toKind === 'file')).toBe(true);
		const feed = createFeedProgram(graph.contents, ts);
		const patched = patchUnresolvedEdges(graph, ts, feed);
		expect(patched.resolvedCount).toBe(0);
	});
});
