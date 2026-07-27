/**
 * Lazy TypeScript engine loader (web host only).
 *
 * Resolution order:
 * 1. Injected module via `globalThis.__ARCH_ATLAS_TS__` or opts.inject
 * 2. Local classic: `typescript-classic` (dev alias of typescript@5.x) then
 *    `typescript` if it still exposes createSourceFile
 * 3. jsDelivr `typescript@latest` (primary CDN — classic UMD when available)
 * 4. unpkg `typescript@latest` on primary failure
 *
 * Note: TypeScript 7+ default npm export is version-only; Exact mass prefers
 * classic `createSourceFile` (local alias or CDN UMD). Text export-surface is
 * fallback only when the classic API is unavailable.
 *
 * Never imported from `src/core`. VS Code hosts inject ImportedSurfaceProvider.
 */

import {
	isClassicTypescriptModule,
	type TypescriptModule,
} from './tsProgramProvider.ts';

export type LoadTypescriptSource =
	| 'inject'
	| 'local'
	| 'jsdelivr'
	| 'unpkg';

export type LoadTypescriptResult =
	| { ok: true; ts: TypescriptModule; source: LoadTypescriptSource }
	| { ok: false; error: string; tried: LoadTypescriptSource[] };

export type LoadTypescriptOpts = {
	/** Force-injected module (tests / host). */
	inject?: TypescriptModule | null;
	/** Override fetch (tests). */
	fetchImpl?: typeof fetch;
	/** Skip local dynamic import (tests that only want CDN path). */
	skipLocal?: boolean;
	/** Skip CDN (tests). */
	skipCdn?: boolean;
	/** Pin version; default `latest` (catalog later for UI pin). */
	version?: string;
};

const JSDELIVR = (v: string) =>
	`https://cdn.jsdelivr.net/npm/typescript@${v}/lib/typescript.js`;
const UNPKG = (v: string) =>
	`https://unpkg.com/typescript@${v}/lib/typescript.js`;

declare global {
	// eslint-disable-next-line no-var
	var __ARCH_ATLAS_TS__: TypescriptModule | undefined;
	// eslint-disable-next-line no-var
	var __ARCH_ATLAS_SURFACE__: import('@core/view/importedSurface.ts').ImportedSurfaceProvider | undefined;
	// eslint-disable-next-line no-var
	var ts: TypescriptModule | undefined;
}

function readGlobalInject(): TypescriptModule | null {
	try {
		const g = globalThis as typeof globalThis & {
			__ARCH_ATLAS_TS__?: TypescriptModule;
		};
		if (g.__ARCH_ATLAS_TS__ && isClassicTypescriptModule(g.__ARCH_ATLAS_TS__)) {
			return g.__ARCH_ATLAS_TS__;
		}
		// Also accept any inject with createSourceFile
		if (g.__ARCH_ATLAS_TS__) return g.__ARCH_ATLAS_TS__;
	} catch {
		/* ignore */
	}
	return null;
}

function coerceModule(mod: unknown): TypescriptModule | null {
	if (!mod || typeof mod !== 'object') return null;
	const asNs = mod as { default?: unknown; createSourceFile?: unknown };
	const candidate = (asNs.default ?? mod) as TypescriptModule;
	if (isClassicTypescriptModule(candidate)) return candidate;
	// Non-classic (TS 7 version-only) — not usable as Program engine
	return null;
}

async function loadLocal(): Promise<TypescriptModule | null> {
	// Prefer classic alias (devDependency typescript-classic → typescript@5.x).
	// Specifiers are runtime strings + @vite-ignore so production Rolldown/Vite
	// does not hard-fail when the alias is absent from the client bundle graph.
	// Web Exact still loads via CDN when local modules are not bundled.
	const classicSpec = 'typescript-classic';
	const tsSpec = 'typescript';
	try {
		const mod = await import(/* @vite-ignore */ classicSpec);
		const ts = coerceModule(mod);
		if (ts) return ts;
	} catch {
		/* not installed / not resolved in this host */
	}
	try {
		const mod = await import(/* @vite-ignore */ tsSpec);
		const ts = coerceModule(mod);
		if (ts) return ts;
	} catch {
		/* not available */
	}
	return null;
}

/**
 * Load typescript.js from a CDN URL via fetch + Function sandbox (UMD).
 */
async function loadFromCdn(
	url: string,
	fetchImpl: typeof fetch,
): Promise<TypescriptModule | null> {
	const res = await fetchImpl(url, { mode: 'cors' });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	const code = await res.text();
	const g = globalThis as typeof globalThis & {
		ts?: TypescriptModule;
		module?: { exports?: unknown };
	};
	const prev = g.ts;
	const moduleShim = { exports: {} as Record<string, unknown> };
	const hadModule = 'module' in g;
	const prevModule = g.module;
	try {
		g.module = moduleShim as { exports: unknown };
		const run = new Function(
			'exports',
			'module',
			`${code}\n;return (typeof ts !== "undefined" ? ts : module.exports);`,
		);
		const result = run(moduleShim.exports, moduleShim) as unknown;
		const candidate =
			coerceModule(result) ??
			coerceModule(g.ts) ??
			coerceModule(moduleShim.exports);
		return candidate;
	} finally {
		if (hadModule) g.module = prevModule;
		else delete (g as { module?: unknown }).module;
		if (!g.ts && prev) g.ts = prev;
	}
}

/**
 * Load the TypeScript compiler module for Exact mode.
 */
export async function loadTypescript(
	opts: LoadTypescriptOpts = {},
): Promise<LoadTypescriptResult> {
	const tried: LoadTypescriptSource[] = [];
	const version = opts.version ?? 'latest';
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);

	// 1. Explicit inject — accept classic or any object (host may inject stub)
	if (opts.inject) {
		return { ok: true, ts: opts.inject, source: 'inject' };
	}
	const globalTs = readGlobalInject();
	if (globalTs) {
		return { ok: true, ts: globalTs, source: 'inject' };
	}

	// 2. Local classic
	if (!opts.skipLocal) {
		tried.push('local');
		const local = await loadLocal();
		if (local) return { ok: true, ts: local, source: 'local' };
	}

	if (opts.skipCdn) {
		return {
			ok: false,
			error: 'TypeScript engine not available (local/inject only; CDN skipped)',
			tried,
		};
	}

	if (!fetchImpl) {
		return {
			ok: false,
			error: 'TypeScript engine not available (no fetch for CDN load)',
			tried,
		};
	}

	// 3. jsDelivr primary
	tried.push('jsdelivr');
	try {
		const ts = await loadFromCdn(JSDELIVR(version), fetchImpl);
		if (ts) return { ok: true, ts, source: 'jsdelivr' };
	} catch {
		/* fall through */
	}

	// 4. unpkg fallback
	tried.push('unpkg');
	try {
		const ts = await loadFromCdn(UNPKG(version), fetchImpl);
		if (ts) return { ok: true, ts, source: 'unpkg' };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {
			ok: false,
			error: `Failed to load TypeScript engine from CDN (${msg})`,
			tried,
		};
	}

	return {
		ok: false,
		error: 'Failed to load TypeScript engine from jsDelivr and unpkg',
		tried,
	};
}

/** CDN URL helpers (tests / docs). */
export const typescriptCdnUrls = {
	jsdelivr: JSDELIVR,
	unpkg: UNPKG,
};
