/**
 * Main-thread client for the Program enrich Web Worker (P4).
 *
 * Spawns a module worker, posts serialized CodeGraph, applies generation
 * cancel + soft timeout. Does not import createProgram into the main bundle
 * path for enrich (worker owns that); serialize is pure core.
 */

import type { CodeGraph } from '@core/graph/types.ts';
import {
	deserializeCodeGraph,
	serializeCodeGraph,
} from '@core/graph/serialize.ts';
import type { ProgramEnrichStats } from '@exact/programEnrich.ts';
import {
	isProgramWorkerProgress,
	isProgramWorkerResult,
	type ProgramWorkerEnrichRequest,
	type ProgramWorkerProgressPhase,
} from '@exact/programWorkerMessages.ts';
// Vite/Astro bundles this as a separate worker chunk (not a raw data: URL of source).
import ProgramWorkerCtor from '../exact/program.worker.ts?worker';

export type ProgramEnrichClientOk = {
	ok: true;
	graph: CodeGraph;
	stats: ProgramEnrichStats;
	thinL3: boolean;
	exportSymbolCount: Map<string, number>;
};

export type ProgramEnrichClientErr = {
	ok: false;
	error: string;
	/** Cancelled by generation / terminate — not a hard failure. */
	cancelled?: boolean;
	/** Soft timeout — worker terminated; prior graph should remain. */
	timeout?: boolean;
};

export type ProgramEnrichClientResult =
	| ProgramEnrichClientOk
	| ProgramEnrichClientErr;

export type RunProgramEnrichmentOpts = {
	/** Browser default true (no disk lib.d.ts). */
	skipDefaultLib?: boolean;
	skipExportSymbols?: boolean;
	/** Soft timeout ms; default 120_000. 0 = no timeout. */
	timeoutMs?: number;
	/** Progress hook (loading-ts | create-program | enrich). */
	onProgress?: (phase: ProgramWorkerProgressPhase) => void;
	/**
	 * Inject Worker constructor (tests). Default: Vite `?worker` ctor for
	 * program.worker.ts (or globalThis.Worker in non-bundled hosts).
	 */
	WorkerCtor?: new (url?: string | URL, opts?: WorkerOptions) => Worker;
	/** When using raw Worker, optional URL (tests). */
	workerUrl?: string | URL;
};

const DEFAULT_TIMEOUT_MS = 120_000;

type Settler = (result: ProgramEnrichClientResult) => void;

/**
 * Singleton-ish client: one active worker, generation token to drop stale
 * results when a new session opens or the user cancels.
 */
export function createProgramWorkerClient(): {
	runProgramEnrichment: (
		graph: CodeGraph,
		opts?: RunProgramEnrichmentOpts,
	) => Promise<ProgramEnrichClientResult>;
	/** Bump generation + terminate in-flight worker (new ZIP/session). */
	cancel: () => void;
	/** Current generation (tests). */
	generation: () => number;
} {
	let generation = 0;
	let activeWorker: Worker | null = null;
	let activeTimer: ReturnType<typeof setTimeout> | null = null;
	/** Settle callback for the current in-flight run (if any). */
	let activeSettle: Settler | null = null;

	function clearTimer(): void {
		if (activeTimer !== null) {
			clearTimeout(activeTimer);
			activeTimer = null;
		}
	}

	function terminateWorkerOnly(): void {
		clearTimer();
		if (activeWorker) {
			try {
				activeWorker.terminate();
			} catch {
				/* ignore */
			}
			activeWorker = null;
		}
	}

	function cancel(): void {
		generation += 1;
		const settle = activeSettle;
		activeSettle = null;
		terminateWorkerOnly();
		if (settle) {
			settle({
				ok: false,
				error: 'Program enrich cancelled (stale generation)',
				cancelled: true,
			});
		}
	}

	async function runProgramEnrichment(
		graph: CodeGraph,
		opts: RunProgramEnrichmentOpts = {},
	): Promise<ProgramEnrichClientResult> {
		// Supersede any prior in-flight work
		cancel();
		const myGen = generation;

		const WorkerCtor =
			opts.WorkerCtor ??
			(ProgramWorkerCtor as
				| (new (url?: string | URL, opts?: WorkerOptions) => Worker)
				| undefined) ??
			globalThis.Worker;
		if (typeof WorkerCtor !== 'function') {
			return {
				ok: false,
				error: 'Web Workers unavailable in this environment',
			};
		}

		let worker: Worker;
		try {
			// Vite `?worker` ctor takes no URL; raw Worker needs URL + module type
			if (opts.WorkerCtor || opts.workerUrl) {
				const url = opts.workerUrl ?? 'mock://program.worker';
				worker = new WorkerCtor(url, { type: 'module' });
			} else if (ProgramWorkerCtor) {
				worker = new (ProgramWorkerCtor as new () => Worker)();
			} else {
				worker = new WorkerCtor(
					new URL('../exact/program.worker.ts', import.meta.url),
					{ type: 'module' },
				);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				ok: false,
				error: `Failed to spawn Program worker: ${msg}`,
			};
		}
		activeWorker = worker;

		const timeoutMs =
			opts.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : opts.timeoutMs;

		return new Promise<ProgramEnrichClientResult>((resolve) => {
			let settled = false;
			const finish = (result: ProgramEnrichClientResult) => {
				if (settled) return;
				settled = true;
				if (activeSettle === finish) activeSettle = null;
				clearTimer();
				if (activeWorker === worker) {
					try {
						worker.terminate();
					} catch {
						/* ignore */
					}
					activeWorker = null;
				}
				if (myGen !== generation) {
					resolve({
						ok: false,
						error: 'Program enrich cancelled (stale generation)',
						cancelled: true,
					});
					return;
				}
				resolve(result);
			};
			activeSettle = finish;

			worker.onmessage = (ev: MessageEvent) => {
				if (myGen !== generation) {
					finish({
						ok: false,
						error: 'Program enrich cancelled (stale generation)',
						cancelled: true,
					});
					return;
				}
				const data = ev.data;
				if (isProgramWorkerProgress(data) && data.id === myGen) {
					opts.onProgress?.(data.phase);
					return;
				}
				if (!isProgramWorkerResult(data) || data.id !== myGen) {
					return;
				}
				if (!data.ok) {
					finish({ ok: false, error: data.error });
					return;
				}
				try {
					const nextGraph = deserializeCodeGraph(data.graph);
					finish({
						ok: true,
						graph: nextGraph,
						stats: data.stats,
						thinL3: data.thinL3,
						exportSymbolCount: new Map(data.exportSymbolCount),
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					finish({
						ok: false,
						error: `Program result deserialize failed: ${msg}`,
					});
				}
			};

			worker.onerror = (ev: ErrorEvent) => {
				const msg = ev.message || 'Program worker error';
				finish({ ok: false, error: msg });
			};

			if (timeoutMs > 0) {
				activeTimer = setTimeout(() => {
					finish({
						ok: false,
						error: `Program enrich timed out after ${timeoutMs}ms (soft-fail; graph unchanged)`,
						timeout: true,
					});
				}, timeoutMs);
			}

			const request: ProgramWorkerEnrichRequest = {
				type: 'enrich',
				id: myGen,
				graph: serializeCodeGraph(graph),
				opts: {
					skipDefaultLib: opts.skipDefaultLib !== false,
					skipExportSymbols: opts.skipExportSymbols === true,
				},
			};
			try {
				worker.postMessage(request);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				finish({
					ok: false,
					error: `Failed to post Program enrich request: ${msg}`,
				});
			}
		});
	}

	return {
		runProgramEnrichment,
		cancel,
		generation: () => generation,
	};
}

/** Shared client for the web composition root (session cancel on new open). */
export const programWorkerClient = createProgramWorkerClient();

export function runProgramEnrichment(
	graph: CodeGraph,
	opts?: RunProgramEnrichmentOpts,
): Promise<ProgramEnrichClientResult> {
	return programWorkerClient.runProgramEnrichment(graph, opts);
}

export function cancelProgramEnrichment(): void {
	programWorkerClient.cancel();
}
