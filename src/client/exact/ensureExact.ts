/**
 * Orchestrate Exact surface mode for the web host:
 * language→engine map → load TypeScript if needed → build provider.
 *
 * Does **not** re-index the graph. Provider is projection/inspect only.
 * Inject path: `globalThis.__ARCH_ATLAS_SURFACE__` skips engine load entirely.
 */

import {
	requiredEngines,
	type CodeGraph,
	type ImportedSurfaceProvider,
	type RequiredEnginesResult,
} from '@core/index.ts';
import { loadTypescript, type LoadTypescriptOpts } from './loadTypescript.ts';
import { createTsProgramProvider } from './tsProgramProvider.ts';

export type EnsureExactResult =
	| {
			ok: true;
			provider: ImportedSurfaceProvider;
			engines: RequiredEnginesResult;
			source: 'inject' | 'local' | 'jsdelivr' | 'unpkg' | 'cached';
	  }
	| {
			ok: false;
			error: string;
			engines: RequiredEnginesResult;
	  };

export type EnsureExactOpts = {
	/** Already-built provider (client cache / host inject). */
	cachedProvider?: ImportedSurfaceProvider | null;
	/** Loader opts (tests, pin version). */
	load?: LoadTypescriptOpts;
	/** Read global inject (default true). */
	allowGlobalSurfaceInject?: boolean;
};

function readGlobalSurface(): ImportedSurfaceProvider | null {
	try {
		const g = globalThis as typeof globalThis & {
			__ARCH_ATLAS_SURFACE__?: ImportedSurfaceProvider;
		};
		return g.__ARCH_ATLAS_SURFACE__ ?? null;
	} catch {
		return null;
	}
}

/**
 * Ensure an {@link ImportedSurfaceProvider} for this graph.
 * Loads typescript when loadable and not injected; reports missing languages
 * for the host warning modal (does not fail the whole enable).
 */
export async function ensureExactForGraph(
	graph: CodeGraph,
	opts: EnsureExactOpts = {},
): Promise<EnsureExactResult> {
	const engines = requiredEngines(graph);

	// Host / test inject of full provider (VS Code shape; no CDN)
	if (opts.allowGlobalSurfaceInject !== false) {
		const injected = readGlobalSurface();
		if (injected) {
			return { ok: true, provider: injected, engines, source: 'inject' };
		}
	}

	if (opts.cachedProvider) {
		return {
			ok: true,
			provider: opts.cachedProvider,
			engines,
			source: 'cached',
		};
	}

	// No JS/TS in graph: Exact surface still needs a provider for gate, but
	// mass will be package/null — install a null-mass provider so gate opens
	// when user forces Exact; missing languages already listed.
	if (!engines.loadable.includes('typescript')) {
		const empty: ImportedSurfaceProvider = {
			targetSurfaceMass: () => null,
		};
		return { ok: true, provider: empty, engines, source: 'inject' };
	}

	const loaded = await loadTypescript(opts.load ?? {});
	if (!loaded.ok) {
		return { ok: false, error: loaded.error, engines };
	}

	const provider = createTsProgramProvider({
		ts: loaded.ts,
		contents: graph.contents,
	});

	return {
		ok: true,
		provider,
		engines,
		source: loaded.source,
	};
}
