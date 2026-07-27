/**
 * Main-thread ↔ Program worker message protocol (P4).
 * Graph payload is {@link SerializedCodeGraph} (pure core serialize).
 */

import type { SerializedCodeGraph } from '@core/graph/serialize.ts';
import type { ProgramEnrichStats } from './programEnrich.ts';

/** Request: run createProgram enrich on a serialized graph. */
export type ProgramWorkerEnrichRequest = {
	type: 'enrich';
	/** Correlation id (generation / request token). */
	id: number;
	graph: SerializedCodeGraph;
	opts?: {
		/**
		 * Skip default lib from disk (browser default: true).
		 * Resolution still works; checker may be incomplete.
		 */
		skipDefaultLib?: boolean;
		/** Skip thin L3 export symbol counts. */
		skipExportSymbols?: boolean;
	};
};

export type ProgramWorkerProgressPhase =
	| 'loading-ts'
	| 'create-program'
	| 'enrich';

export type ProgramWorkerProgress = {
	type: 'progress';
	id: number;
	phase: ProgramWorkerProgressPhase;
};

export type ProgramWorkerResultOk = {
	type: 'result';
	id: number;
	ok: true;
	graph: SerializedCodeGraph;
	stats: ProgramEnrichStats;
	thinL3: boolean;
	/** path → export symbol count (array form for structured clone). */
	exportSymbolCount: [string, number][];
};

export type ProgramWorkerResultErr = {
	type: 'result';
	id: number;
	ok: false;
	error: string;
};

export type ProgramWorkerResult = ProgramWorkerResultOk | ProgramWorkerResultErr;

export type ProgramWorkerInbound = ProgramWorkerEnrichRequest;
export type ProgramWorkerOutbound = ProgramWorkerProgress | ProgramWorkerResult;

export function isProgramWorkerResult(msg: unknown): msg is ProgramWorkerResult {
	return (
		!!msg &&
		typeof msg === 'object' &&
		(msg as { type?: string }).type === 'result' &&
		typeof (msg as { id?: unknown }).id === 'number'
	);
}

export function isProgramWorkerProgress(
	msg: unknown,
): msg is ProgramWorkerProgress {
	return (
		!!msg &&
		typeof msg === 'object' &&
		(msg as { type?: string }).type === 'progress' &&
		typeof (msg as { id?: unknown }).id === 'number'
	);
}
