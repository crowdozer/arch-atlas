/**
 * Spine ranking for the map catalog.
 * Unopinionated topology: direct fan-in + importer module diversity (topFolder).
 * No basename heuristics. Not multi-hop blast alone.
 */

import {
	fileDistances,
	fileImportedByAdj,
} from '@core/catalog/deepest.ts';
import type {
	CatalogSpine,
	CodeGraph,
	SpineFormula,
} from '@core/graph/types.ts';
import { topFolder } from '@core/view/alluvial.ts';

export const DEFAULT_SPINE_FORMULA: SpineFormula = 'modules-then-in';

export const SPINE_FORMULAS: readonly SpineFormula[] = [
	'modules-then-in',
	'fan-in',
	'composite',
	'share',
] as const;

/**
 * Build observed spine metrics for every source file with inDegree > 0.
 * Reverse reach uses the same BFS as blast radius (exclude self).
 */
export function spineMetrics(graph: CodeGraph): CatalogSpine[] {
	const revAdj = fileImportedByAdj(graph);
	const outDeg = new Map<string, number>();
	const importers = new Map<string, string[]>();

	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'file') {
			const list = importers.get(e.to) ?? [];
			list.push(e.from);
			importers.set(e.to, list);
		}
	}

	const sourceCount = graph.stats.sourceCount;
	const rows: CatalogSpine[] = [];

	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const importerPaths = importers.get(path) ?? [];
		// Distinct importers for inDegree (edge multi-count not used)
		const distinctImporters = [...new Set(importerPaths)];
		const inDegree = distinctImporters.length;
		if (inDegree <= 0) continue;

		const modules = new Set<string>();
		for (const imp of distinctImporters) {
			modules.add(topFolder(imp));
		}
		const importerModuleCount = modules.size;
		const { dist } = fileDistances(graph, path, revAdj);
		const reverseReachFiles = Math.max(0, dist.size - 1);
		const inShare = sourceCount > 0 ? inDegree / sourceCount : 0;
		const composite = inDegree * importerModuleCount;

		rows.push({
			id: path,
			path,
			inDegree,
			outDegree: outDeg.get(path) ?? 0,
			importerModuleCount,
			reverseReachFiles,
			inShare,
			composite,
			epistemic: 'observed',
		});
	}

	return rows;
}

/**
 * Rank spine metric rows by formula. Soft floor: skip importerModuleCount < 2
 * except in `fan-in` mode (pure inDegree may include single-module hubs).
 */
export function rankSpineRows(
	rows: readonly CatalogSpine[],
	formula: SpineFormula = DEFAULT_SPINE_FORMULA,
	limit = 15,
): CatalogSpine[] {
	const filtered =
		formula === 'fan-in'
			? [...rows]
			: rows.filter((r) => r.importerModuleCount >= 2);

	const sorted = filtered.sort((a, b) => {
		const cmp = compareSpine(a, b, formula);
		return cmp !== 0 ? cmp : a.path.localeCompare(b.path);
	});
	return sorted.slice(0, Math.max(0, limit));
}

function compareSpine(
	a: CatalogSpine,
	b: CatalogSpine,
	formula: SpineFormula,
): number {
	switch (formula) {
		case 'fan-in':
			return (
				b.inDegree - a.inDegree ||
				b.importerModuleCount - a.importerModuleCount
			);
		case 'composite':
			return (
				b.composite - a.composite ||
				b.importerModuleCount - a.importerModuleCount
			);
		case 'share':
			return (
				b.inShare - a.inShare ||
				b.importerModuleCount - a.importerModuleCount
			);
		case 'modules-then-in':
		default:
			return (
				b.importerModuleCount - a.importerModuleCount ||
				b.inDegree - a.inDegree ||
				b.reverseReachFiles - a.reverseReachFiles
			);
	}
}

/**
 * Source files ranked as dependency-plane spines for the map catalog.
 */
export function catalogSpines(
	graph: CodeGraph,
	limit = 15,
	formula: SpineFormula = DEFAULT_SPINE_FORMULA,
): CatalogSpine[] {
	return rankSpineRows(spineMetrics(graph), formula, limit);
}
