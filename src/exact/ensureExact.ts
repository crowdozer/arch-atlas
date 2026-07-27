/**
 * Orchestrate Exact surface mode for host injectors (web + future hosts):
 * language→engine map → load TypeScript if needed → build provider.
 *
 * Does **not** re-index the graph. Provider is projection/inspect only.
 * Inject path: `globalThis.__ARCH_ATLAS_SURFACE__` skips engine load entirely.
 * Host-shared package (`src/exact/`); not pure core (loader may fetch CDN).
 */

import {
	requiredEngines,
	type CodeGraph,
	type ImportedSurfaceProvider,
	type RequiredEnginesResult,
} from '@core/index.ts';
import { loadTypescript, type LoadTypescriptOpts } from './loadTypescript.ts';
import { createTsProgramProvider } from './tsProgramProvider.ts';

export type EnsureExactSource =
	| 'inject'
	| 'local'
	| 'jsdelivr'
	| 'unpkg'
	| 'cached'
	/** Graph has no JS/TS — null-mass provider for manual Exact only. */
	| 'empty';

export type EnsureExactResult =
	| {
			ok: true;
			provider: ImportedSurfaceProvider;
			engines: RequiredEnginesResult;
			source: EnsureExactSource;
	  }
	| {
			ok: false;
			error: string;
			engines: RequiredEnginesResult;
	  };

/** Sources that justify auto-enabling Exact (no CDN). */
export function isLocalExactSource(source: EnsureExactSource): boolean {
	return source === 'inject' || source === 'local' || source === 'cached';
}

export type EnsureExactOpts = {
	/** Already-built provider (host cache / host inject). */
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
		return { ok: true, provider: empty, engines, source: 'empty' };
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

/**
 * Ensure Exact using only inject / local classic / cache — **never CDN**.
 * Prefer for default-on when the analysis engine is already on-device.
 */
export async function ensureExactLocalOnly(
	graph: CodeGraph,
	opts: EnsureExactOpts = {},
): Promise<EnsureExactResult> {
	return ensureExactForGraph(graph, {
		...opts,
		load: { ...opts.load, skipCdn: true },
	});
}
