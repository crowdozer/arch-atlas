/**
 * Alluvial band-width weight axes (projection-time only).
 * Graph edges stay unweighted; projectors call edgeWeight per edge.
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';

/** Selectable band-width axes. Default is unit-1 import edges. */
export type WeightAxis = 'import-edges' | 'importer-loc' | 'target-loc';

const DEFAULT_AXIS: WeightAxis = 'import-edges';

/**
 * Integer line count from source text (newline-based).
 * Empty → 0; trailing content without final newline still counts as a line.
 */
export function lineCount(text: string): number {
	if (!text) return 0;
	let n = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10 /* \n */) n += 1;
	}
	// Non-empty text without trailing newline still has a last line
	if (text.charCodeAt(text.length - 1) !== 10) n += 1;
	return n;
}

/** LOC of a file path from graph.contents; 0 if missing. */
export function fileLineCount(graph: CodeGraph, path: string): number {
	const text = graph.contents.get(path);
	if (text === undefined) return 0;
	return lineCount(text);
}

/**
 * Weight for one observed import edge under the chosen axis.
 * - import-edges: always 1
 * - importer-loc: LOC of e.from (min 1 if empty/missing)
 * - target-loc: LOC of e.to when file; else 1 (package/unresolved fallback)
 */
export function edgeWeight(
	e: ImportEdge,
	graph: CodeGraph,
	axis: WeightAxis = DEFAULT_AXIS,
): number {
	switch (axis) {
		case 'import-edges':
			return 1;
		case 'importer-loc': {
			const n = fileLineCount(graph, e.from);
			return n > 0 ? n : 1;
		}
		case 'target-loc': {
			if (e.toKind === 'file') {
				const n = fileLineCount(graph, e.to);
				return n > 0 ? n : 1;
			}
			// Package / unresolved: no observed package source LOC
			return 1;
		}
		default: {
			const _exhaustive: never = axis;
			return _exhaustive;
		}
	}
}

/**
 * Carbon `units` string for the axis.
 * `context` only affects the import-edges label (forward package-mass vs reverse edges).
 * LOC labels are honest: package/unresolved under target-loc fall back to 1, not package LOC.
 */
export function unitsForAxis(
	axis: WeightAxis = DEFAULT_AXIS,
	context: 'package-mass' | 'import-edges' = 'import-edges',
): string {
	switch (axis) {
		case 'import-edges':
			return context === 'package-mass' ? 'package imports' : 'import edges';
		case 'importer-loc':
			return 'importer lines of code';
		case 'target-loc':
			return 'imported file lines (packages = 1)';
		default: {
			const _exhaustive: never = axis;
			return _exhaustive;
		}
	}
}

export function resolveWeightAxis(axis?: WeightAxis): WeightAxis {
	return axis ?? DEFAULT_AXIS;
}
