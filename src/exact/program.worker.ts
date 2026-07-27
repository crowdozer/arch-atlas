/**
 * Browser Program enrich worker (analysis-protocol P4).
 *
 * Loads classic TypeScript (CDN / inject), runs {@link enrichGraphWithProgram}
 * with skipDefaultLib:true by default, posts serialized result.
 * Soft-fail: result.ok false on any error (main thread keeps L1 graph).
 */

import {
	deserializeCodeGraph,
	serializeCodeGraph,
} from '@core/graph/serialize.ts';
import { loadTypescript } from './loadTypescript.ts';
import { enrichGraphWithProgram } from './programEnrich.ts';
import { isProgramTypescriptModule } from './programHost.ts';
import type {
	ProgramWorkerInbound,
	ProgramWorkerOutbound,
} from './programWorkerMessages.ts';

declare const self: DedicatedWorkerGlobalScope;

function post(msg: ProgramWorkerOutbound): void {
	self.postMessage(msg);
}

self.onmessage = async (ev: MessageEvent<ProgramWorkerInbound>) => {
	const data = ev.data;
	if (!data || data.type !== 'enrich' || typeof data.id !== 'number') {
		return;
	}
	const id = data.id;
	try {
		post({ type: 'progress', id, phase: 'loading-ts' });
		const loaded = await loadTypescript();
		if (!loaded.ok) {
			post({
				type: 'result',
				id,
				ok: false,
				error: `Program unavailable (${loaded.error})`,
			});
			return;
		}
		if (!isProgramTypescriptModule(loaded.ts)) {
			post({
				type: 'result',
				id,
				ok: false,
				error:
					'Program unavailable (loaded TypeScript lacks createProgram/resolveModuleName); not a language server',
			});
			return;
		}

		post({ type: 'progress', id, phase: 'create-program' });
		const graph = deserializeCodeGraph(data.graph);
		const skipDefaultLib = data.opts?.skipDefaultLib !== false;
		const skipExportSymbols = data.opts?.skipExportSymbols === true;

		post({ type: 'progress', id, phase: 'enrich' });
		const enrich = enrichGraphWithProgram(graph, loaded.ts, {
			skipDefaultLib,
			skipExportSymbols,
		});

		post({
			type: 'result',
			id,
			ok: true,
			graph: serializeCodeGraph(enrich.graph),
			stats: enrich.stats,
			thinL3: enrich.thinL3,
			exportSymbolCount: [...enrich.exportSymbolCount.entries()],
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		post({
			type: 'result',
			id,
			ok: false,
			error: `Program enrichment failed soft: ${msg}`,
		});
	}
};
