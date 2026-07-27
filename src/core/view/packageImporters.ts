/**
 * Package sink helpers: match edges into a package, pick a file-hub open target.
 * Package→importers alluvial was removed — package chips open file-hub on the
 * primary importer instead.
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';

/** True when edge targets the given package id or display label. */
export function edgeMatchesPackage(e: ImportEdge, packageIdOrLabel: string): boolean {
	if (e.toKind === 'file') return false;
	if (e.to === packageIdOrLabel) return true;
	const label =
		e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
	return label === packageIdOrLabel;
}

/**
 * File to open as file-hub when the user targets a package/unresolved sink.
 * Picks the importer with the most edges into the package; path A–Z on ties.
 * Returns null when no observed imports exist (declared-only packages).
 */
export function primaryImporterFile(
	graph: CodeGraph,
	packageIdOrLabel: string,
): string | null {
	const counts = new Map<string, number>();
	for (const e of graph.edges) {
		if (!edgeMatchesPackage(e, packageIdOrLabel)) continue;
		counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
	}
	if (!counts.size) return null;
	const ranked = [...counts.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	return ranked[0]![0];
}
