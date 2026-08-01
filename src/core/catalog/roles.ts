/**
 * Inferred file roles for agent ranking honesty.
 * Epistemic: always inferred - never presented as observed topology.
 */

import type { CodeGraph, InferredFileRole } from '@core/graph/types.ts';
import { isTestPath, normalizePath } from '@core/ignore.ts';
import { fileLineCount } from '@core/view/weight.ts';

/** Path looks like debug / scripts tooling (not a product entrypoint). */
export function isDebugPath(path: string): boolean {
	const p = normalizePath(path);
	if (!p) return false;
	const parts = p.split('/');
	for (const seg of parts) {
		if (seg === 'debug' || seg === 'scripts') return true;
	}
	const base = parts[parts.length - 1] ?? '';
	if (/\.probe\./i.test(base)) return true;
	if (/\.debug\./i.test(base)) return true;
	return false;
}

/** Basename looks like a barrel / public re-export surface. */
export function isBarrelBasename(path: string): boolean {
	const base = (normalizePath(path).split('/').pop() ?? '').toLowerCase();
	return (
		base === 'index.ts' ||
		base === 'index.tsx' ||
		base === 'index.js' ||
		base === 'index.jsx' ||
		base === 'index.mjs' ||
		base === 'index.cjs' ||
		base === 'public.ts' ||
		base === 'public.tsx' ||
		base === 'public.js'
	);
}

/** Basename is a public façade surface (`public.ts` / `.tsx` / `.js`). */
export function isFacadeBasename(path: string): boolean {
	const base = (normalizePath(path).split('/').pop() ?? '').toLowerCase();
	return base === 'public.ts' || base === 'public.tsx' || base === 'public.js';
}

/** Path has a `public` segment (folder or basename stem). */
function hasPublicSegment(path: string): boolean {
	const p = normalizePath(path);
	const parts = p.split('/');
	for (const seg of parts) {
		if (seg === 'public') return true;
	}
	const base = parts[parts.length - 1] ?? '';
	return /^public\./i.test(base);
}

/**
 * Pure re-export barrel heuristic: barrel basename + re-export dominance
 * or high outDegree with tiny whole-file LOC.
 */
export function isPureBarrel(graph: CodeGraph, path: string): boolean {
	if (!isBarrelBasename(path)) return false;
	let out = 0;
	let exportForm = 0;
	for (const e of graph.edges) {
		if (e.from !== path) continue;
		out += 1;
		if (e.form === 'export') exportForm += 1;
	}
	if (out === 0) return false;
	// Re-export dominance
	if (exportForm / out >= 0.6) return true;
	const loc = fileLineCount(graph, path);
	// Thin façade: many outs, almost no body
	if (out >= 3 && loc > 0 && loc <= 40) return true;
	return false;
}

/**
 * Façade heuristic (inferred): public.ts basename, or pure barrel under a
 * `public` path segment with re-export dominance.
 */
export function isFacade(graph: CodeGraph, path: string): boolean {
	if (isFacadeBasename(path)) {
		// public.ts with any re-exports / outs is a façade surface
		let out = 0;
		for (const e of graph.edges) {
			if (e.from === path) out += 1;
		}
		if (out > 0) return true;
		// Empty public.ts still named as façade for role honesty
		return true;
	}
	// Barrel with high reexport share + path segment `public`
	if (hasPublicSegment(path) && isPureBarrel(graph, path)) return true;
	return false;
}

/**
 * True when hotspot rankScore should be demoted (barrel or façade).
 * Single demotion factor - do not stack.
 */
export function isHotspotDemotedSurface(graph: CodeGraph, path: string): boolean {
	return isFacade(graph, path) || isPureBarrel(graph, path);
}

/** Demotion multiplier applied to base hotspot score for barrel/façade. */
export const HOTSPOT_SURFACE_DEMOTION = 0.35;

export type InferFileRolesOpts = {
	/** Paths treated as entrypoints (from starts entrypoint set). */
	entrypointSet?: ReadonlySet<string>;
};

/**
 * Infer zero or more roles for a path. Always includes at least `module`
 * when no stronger role applies; callers may filter.
 */
export function inferFileRoles(
	graph: CodeGraph,
	path: string,
	opts?: InferFileRolesOpts,
): InferredFileRole[] {
	const roles: InferredFileRole[] = [];
	if (isTestPath(path)) roles.push('test');
	if (isDebugPath(path)) roles.push('debug');
	if (opts?.entrypointSet?.has(path)) roles.push('entrypoint');
	if (isFacade(graph, path)) roles.push('facade');
	if (isPureBarrel(graph, path)) roles.push('barrel');
	if (!roles.length) roles.push('module');
	return roles;
}

/** Primary role for badge display (first non-module, else module). */
export function primaryRole(roles: readonly InferredFileRole[]): InferredFileRole {
	for (const r of roles) {
		if (r !== 'module') return r;
	}
	return 'module';
}
