import { describe, expect, it, vi } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import { serializeCodeGraph } from '@core/graph/serialize.ts';
import type { ProgramWorkerOutbound } from '@exact/programWorkerMessages.ts';

// Avoid Vite ?worker resolution under vitest (tests inject WorkerCtor).
vi.mock('../exact/program.worker.ts?worker', () => ({
	default: class {
		constructor() {
			throw new Error('default ProgramWorker should not be used in unit tests');
		}
	},
}));

import { createProgramWorkerClient } from './programWorkerClient.ts';

/** Minimal Worker mock: echoes a pre-canned result on postMessage. */
function mockWorkerCtor(
	handler: (req: unknown, post: (msg: ProgramWorkerOutbound) => void) => void,
): typeof Worker {
	return class MockWorker {
		onmessage: ((ev: MessageEvent) => void) | null = null;
		onerror: ((ev: ErrorEvent) => void) | null = null;
		constructor(_url: string | URL, _opts?: WorkerOptions) {
			/* no-op */
		}
		postMessage(data: unknown): void {
			const post = (msg: ProgramWorkerOutbound) => {
				this.onmessage?.({ data: msg } as MessageEvent);
			};
			// async like a real worker
			queueMicrotask(() => handler(data, post));
		}
		terminate(): void {
			/* no-op */
		}
		addEventListener(): void {}
		removeEventListener(): void {}
		dispatchEvent(): boolean {
			return false;
		}
		onmessageerror = null;
	} as unknown as typeof Worker;
}

describe('programWorkerClient', () => {
	const sampleGraph = () =>
		buildGraph([
			{
				path: 'a.ts',
				content: `export const a = 1;\n`,
				byteLength: 20,
			},
		]);

	it('resolves ok when worker returns result with matching id', async () => {
		const graph = sampleGraph();
		const client = createProgramWorkerClient();
		const WorkerCtor = mockWorkerCtor((req, post) => {
			const r = req as { id: number; type: string };
			post({ type: 'progress', id: r.id, phase: 'loading-ts' });
			post({
				type: 'result',
				id: r.id,
				ok: true,
				graph: serializeCodeGraph(graph),
				stats: {
					resolvedCount: 0,
					resolvedAliasCount: 0,
					exportSymbolFileCount: 0,
					rootFileCount: 1,
					tsconfig: 'none',
					missingLibs: [],
				},
				thinL3: false,
				exportSymbolCount: [],
			});
		});

		const phases: string[] = [];
		const result = await client.runProgramEnrichment(graph, {
			WorkerCtor,
			workerUrl: 'mock://program.worker',
			onProgress: (p) => phases.push(p),
			timeoutMs: 5_000,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.graph.files.has('a.ts')).toBe(true);
			expect(result.stats.rootFileCount).toBe(1);
		}
		expect(phases).toContain('loading-ts');
	});

	it('soft-fails on worker error result', async () => {
		const graph = sampleGraph();
		const client = createProgramWorkerClient();
		const WorkerCtor = mockWorkerCtor((req, post) => {
			const r = req as { id: number };
			post({
				type: 'result',
				id: r.id,
				ok: false,
				error: 'no createProgram',
			});
		});
		const result = await client.runProgramEnrichment(graph, {
			WorkerCtor,
			workerUrl: 'mock://program.worker',
			timeoutMs: 5_000,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/createProgram/);
	});

	it('cancel bumps generation and marks in-flight cancelled', async () => {
		const graph = sampleGraph();
		const client = createProgramWorkerClient();
		let postFn: ((msg: ProgramWorkerOutbound) => void) | null = null;
		const WorkerCtor = mockWorkerCtor((req, post) => {
			postFn = post;
			// do not respond until after cancel
			void req;
		});

		const pending = client.runProgramEnrichment(graph, {
			WorkerCtor,
			workerUrl: 'mock://program.worker',
			timeoutMs: 0,
		});
		// Let microtask register postMessage
		await Promise.resolve();
		client.cancel();
		// Late result with old id should be ignored / cancelled
		const genBefore = client.generation();
		expect(genBefore).toBeGreaterThan(0);
		if (postFn) {
			(postFn as (msg: ProgramWorkerOutbound) => void)({
				type: 'result',
				id: genBefore - 1,
				ok: true,
				graph: serializeCodeGraph(graph),
				stats: {
					resolvedCount: 0,
					resolvedAliasCount: 0,
					exportSymbolFileCount: 0,
					rootFileCount: 1,
					tsconfig: 'none',
					missingLibs: [],
				},
				thinL3: false,
				exportSymbolCount: [],
			});
		}
		const result = await pending;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.cancelled).toBe(true);
	});

	it('timeout soft-fails', async () => {
		vi.useFakeTimers();
		try {
			const graph = sampleGraph();
			const client = createProgramWorkerClient();
			const WorkerCtor = mockWorkerCtor(() => {
				/* never respond */
			});
			const pending = client.runProgramEnrichment(graph, {
				WorkerCtor,
				workerUrl: 'mock://program.worker',
				timeoutMs: 100,
			});
			await vi.advanceTimersByTimeAsync(150);
			const result = await pending;
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.timeout).toBe(true);
				expect(result.error).toMatch(/timed out/);
			}
		} finally {
			vi.useRealTimers();
		}
	});
});
