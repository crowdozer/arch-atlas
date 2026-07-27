/**
 * Reverse blast-radius ranking for the map catalog.
 * Counts consumers that can reach a file via reverse import chains.
 * Ranking prefers runtime edges; honesty: reverse-reach is cycle-sensitive.
 */

import {
	fileDistances,
	fileImportedByAdj,
} from '@core/catalog/deepest.ts';
import type { CatalogBlast, CodeGraph } from '@core/graph/types.ts';

const BLAST_REASON = 'reverse-reach file count (cycle-sensitive)';

/**
 * Source files ranked by reverse-reachable consumer count.
 *
 * Defaults (reversible):
 * - revAdj = fileImportedByAdj(graph, runtimeOnly) once
 * - reverseReachFiles = dist.size - 1 (exclude self)
 * - reverseMaxHops from BFS
 * - Keep reverseReachFiles > 0
 * - Sort reverseReachFiles desc, reverseMaxHops desc, path; limit 15
 * - epistemic: observed (pure count order, not a classifier)
 */
export function catalogBlastRadius(graph: CodeGraph, limit = 15): CatalogBlast[] {
	const revAdj = fileImportedByAdj(graph, { runtimeOnly: true });
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();

	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}

	const rows: CatalogBlast[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const { dist, maxHops } = fileDistances(graph, path, revAdj);
		const reverseReachFiles = dist.size - 1;
		if (reverseReachFiles <= 0) continue;
		rows.push({
			id: path,
			path,
			reverseReachFiles,
			reverseMaxHops: maxHops,
			inDegree: inDeg.get(path) ?? 0,
			outDegree: outDeg.get(path) ?? 0,
			reason: BLAST_REASON,
			epistemic: 'observed',
		});
	}

	rows.sort(
		(a, b) =>
			b.reverseReachFiles - a.reverseReachFiles ||
			b.reverseMaxHops - a.reverseMaxHops ||
			a.path.localeCompare(b.path),
	);
	return rows.slice(0, limit);
}
