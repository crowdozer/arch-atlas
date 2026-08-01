/**
 * In-process Program enrich with skipDefaultLib (browser worker default).
 * Does not spawn a Worker - validates enrich path used by program.worker.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import {
	deserializeCodeGraph,
	serializeCodeGraph,
} from '@core/graph/serialize.ts';
import { enrichGraphWithProgram } from './programEnrich.ts';
import {
	isProgramTypescriptModule,
} from './programHost.ts';
import { loadTypescript } from './loadTypescript.ts';

async function loadClassic() {
	const loaded = await loadTypescript({ skipCdn: true });
	if (!loaded.ok) throw new Error(loaded.error);
	if (!isProgramTypescriptModule(loaded.ts)) {
		throw new Error('local typescript is not Program-capable');
	}
	return loaded.ts;
}

describe('browser Program path (skipDefaultLib + serialize)', () => {
	it('enriches via serialize → enrich(skipDefaultLib) → deserialize', async () => {
		const ts = await loadClassic();
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
		const graphWithCfg = { ...graph, contents };

		// Same wire path as main → worker
		const wire = serializeCodeGraph(graphWithCfg);
		const inWorker = deserializeCodeGraph(wire);
		const result = enrichGraphWithProgram(inWorker, ts, {
			skipDefaultLib: true,
		});
		expect(result.applied).toBe(true);
		expect(result.stats.resolvedCount).toBeGreaterThanOrEqual(1);
		const edge = result.graph.edges.find((e) => e.from === 'client/main.ts');
		expect(edge?.toKind).toBe('file');
		expect(edge?.to).toBe('client/util.ts');

		// Result can re-cross the wire
		const back = deserializeCodeGraph(serializeCodeGraph(result.graph));
		expect(back.stats.unresolvedCount).toBe(result.graph.stats.unresolvedCount);
	});
});
