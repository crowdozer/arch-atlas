/**
 * Exact imported-surface port (typed stub).
 *
 * Future LSP / TS Program hosts implement this; core stays pure (no vscode).
 * Default absence → Exact fails closed via `resolveWeightRequest` / inspect
 * blockers. `edgeWeight` estimate semantics are unchanged until projectors
 * wire Exact mass (deferred).
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
	 */
	importedSurface?(
		graph: CodeGraph,
		edge: ImportEdge,
	): { text: string; note: string } | null;

	/**
	 * Exact callsites for inspect (optional).
	 * Null / omit → withhold callsites under exact.
	 */
	callSites?(
		graph: CodeGraph,
		edge: ImportEdge,
	): CallSiteSnippet[] | null;
};
