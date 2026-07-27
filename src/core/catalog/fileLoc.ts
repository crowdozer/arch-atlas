/**
 * File LOC ranking for the map catalog.
 * Whole-file line count of indexed source (same estimate as tree LOC captions).
 */

import type { CatalogFileLoc, CodeGraph } from '@core/graph/types.ts';
import { fileLineCount } from '@core/view/weight.ts';

/**
 * Source files ranked by whole-file LOC descending.
 * Degrees are included for list badges / selection context only.
 */
export function catalogFileLoc(graph: CodeGraph, limit = 15): CatalogFileLoc[] {
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();

	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}

	const rows: CatalogFileLoc[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const loc = fileLineCount(graph, path);
		if (loc <= 0) continue;
		rows.push({
			id: path,
			path,
			loc,
			outDegree: outDeg.get(path) ?? 0,
			inDegree: inDeg.get(path) ?? 0,
			epistemic: 'observed',
		});
	}

	rows.sort(
		(a, b) => b.loc - a.loc || a.path.localeCompare(b.path),
	);
	return rows.slice(0, limit);
}
