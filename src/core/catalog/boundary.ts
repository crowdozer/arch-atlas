/**
 * Boundary crossings: deep imports past barrel/façade surfaces.
 * Heuristic (inferred): importers outside a surface folder that import
 * non-surface modules under that folder.
 */

import { isFacade, isPureBarrel } from '@core/catalog/roles.ts';
import type { CatalogBoundaryCrossing, CodeGraph } from '@core/graph/types.ts';
import { normalizePath } from '@core/ignore.ts';

function dirnamePosix(path: string): string {
	const p = normalizePath(path);
	const i = p.lastIndexOf('/');
	if (i <= 0) return '';
	return p.slice(0, i);
}

/** True when `path` is strictly under `dir` (or equal when dir empty = root). */
function isUnderDir(path: string, dir: string): boolean {
	const p = normalizePath(path);
	if (!dir) {
		// Root-level barrel: "under" means same-directory siblings only
		return !p.includes('/');
	}
	return p === dir || p.startsWith(`${dir}/`);
}

/** True when importer is outside the barrel directory. */
function isOutsideDir(path: string, dir: string): boolean {
	return !isUnderDir(path, dir);
}

/**
 * Surface files for a barrel folder: the barrel/façade itself (and other
 * pure barrels / façades in the same directory).
 */
function surfaceSetForDir(
	graph: CodeGraph,
	dir: string,
	surfaces: readonly string[],
): Set<string> {
	const set = new Set<string>();
	for (const s of surfaces) {
		if (dirnamePosix(s) === dir) set.add(s);
	}
	// Also treat co-located pure barrels/façades as surfaces
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		if (dirnamePosix(path) !== dir) continue;
		if (isPureBarrel(graph, path) || isFacade(graph, path)) set.add(path);
	}
	return set;
}

/**
 * Find deep imports past barrel/façade folders.
 * Capped by `limit` (stable sort: barrel, from, to, line).
 */
export function catalogBoundaryCrossings(
	graph: CodeGraph,
	limit = 40,
): CatalogBoundaryCrossing[] {
	// Collect barrel + façade surfaces
	const surfaces: string[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		if (isPureBarrel(graph, path) || isFacade(graph, path)) {
			surfaces.push(path);
		}
	}
	surfaces.sort((a, b) => a.localeCompare(b));

	// Group by directory so we attribute crossings to one surface per folder
	const dirToBarrel = new Map<string, string>();
	for (const s of surfaces) {
		const dir = dirnamePosix(s);
		// Prefer façade basename, else first barrel path (stable)
		const prev = dirToBarrel.get(dir);
		if (!prev) {
			dirToBarrel.set(dir, s);
			continue;
		}
		if (isFacade(graph, s) && !isFacade(graph, prev)) {
			dirToBarrel.set(dir, s);
		} else if (s.localeCompare(prev) < 0 && !isFacade(graph, prev)) {
			dirToBarrel.set(dir, s);
		}
	}

	const crossings: CatalogBoundaryCrossing[] = [];
	const seen = new Set<string>();

	for (const [dir, barrel] of dirToBarrel) {
		const surfacesInDir = surfaceSetForDir(graph, dir, surfaces);
		for (const e of graph.edges) {
			if (e.toKind !== 'file') continue;
			// Importer outside folder; target under folder and not a surface
			if (!isOutsideDir(e.from, dir)) continue;
			if (!isUnderDir(e.to, dir)) continue;
			if (surfacesInDir.has(e.to)) continue;
			// Target should be a source module under the barrel folder
			if (!graph.files.has(e.to)) continue;

			const key = `${barrel}|${e.from}|${e.to}|${e.line}`;
			if (seen.has(key)) continue;
			seen.add(key);

			crossings.push({
				barrel,
				from: e.from,
				to: e.to,
				line: e.line,
				epistemic: 'inferred',
			});
		}
	}

	crossings.sort(
		(a, b) =>
			a.barrel.localeCompare(b.barrel) ||
			a.from.localeCompare(b.from) ||
			a.to.localeCompare(b.to) ||
			(a.line ?? 0) - (b.line ?? 0),
	);
	return crossings.slice(0, Math.max(0, limit));
}
