/**
 * Exact imported-surface port.
 *
 * Hosts implement this (web: TS Program provider; VS Code: language features).
 * Core stays pure (no vscode, no fetch). Default absence → Exact fails closed
 * via `resolveWeightRequest` / inspect blockers. Under exact + target-loc,
 * projectors pass the provider into `edgeWeight` for surface mass.
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';
import type { CallSiteSnippet } from '@core/view/inspect.ts';

/**
 * Optional Exact provider for imported-surface honesty.
 * Presence unblocks `exact` + `target-loc` weight requests; methods supply
 * per-edge mass and inspect surface when implemented.
 */
export type ImportedSurfaceProvider = {
	/**
	 * Exact mass for the imported surface of one edge (`target-loc` honesty).
	 * Return `null` → treat as unavailable for that edge.
	 */
	targetSurfaceMass(graph: CodeGraph, edge: ImportEdge): number | null;

	/**
	 * Exact imported surface excerpt for inspect (optional).
	 * Null / omit → withhold surface under exact (blocker or empty).
	 * When present, `startLine`/`endLine` are 1-based line numbers in `path`
	 * (file), not relative to the excerpt alone.
	 */
	importedSurface?(
		graph: CodeGraph,
		edge: ImportEdge,
	): {
		text: string;
		note: string;
		/** 1-based start line in the target file (optional). */
		startLine?: number;
		/** 1-based end line in the target file (optional). */
		endLine?: number;
	} | null;

	/**
	 * Exact callsites for inspect (optional).
	 * Null / omit → withhold callsites under exact.
	 */
	callSites?(
		graph: CodeGraph,
		edge: ImportEdge,
	): CallSiteSnippet[] | null;
};
