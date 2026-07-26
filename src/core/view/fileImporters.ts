/**
 * File reverse projection: who imports this file?
 * Columns (L→R): File → Importers
 *
 * Used for fan-in hubs (e.g. logger.ts) that show high edge counts from
 * inbound edges but have little/no outbound import surface.
 */

import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
} from '@core/graph/types.ts';
import {
	basename,
	buildAlluvialPayload,
	TEAL,
	topFolder,
	uniqueFileLabels,
} from '@core/view/alluvial.ts';

const FILE_PROMOTE_THRESHOLD = 12;

/**
 * Project importers of a source file as an alluvial.
 * Returns null when nothing imports the file.
 */
export function projectFileImporters(
	graph: CodeGraph,
	fileId: string,
	opts?: { heightPx?: number; maxImporters?: number },
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 360;
	const maxImporters = opts?.maxImporters ?? 16;

	const edges = graph.edges.filter((e) => e.toKind === 'file' && e.to === fileId);
	if (!edges.length) return null;

	const focus: AlluvialFocus = {
		kind: 'file',
		id: fileId,
		label: basename(fileId),
	};
	// Prefer full path as left-node name when basenames collide later; for the
	// focus node itself use a stable label that matches nodeRef.
	const labelsForFocus = uniqueFileLabels([fileId, ...edges.map((e) => e.from)]);
	const fileLabel = labelsForFocus.get(fileId) ?? basename(fileId);

	const importerPaths = [...new Set(edges.map((e) => e.from))];
	const useFiles = importerPaths.length <= FILE_PROMOTE_THRESHOLD;

	const weights = new Map<string, number>();
	const importerRef = new Map<string, AlluvialNodeRef>();

	if (useFiles) {
		const labels = uniqueFileLabels(importerPaths);
		for (const e of edges) {
			const label = labels.get(e.from) ?? basename(e.from);
			weights.set(label, (weights.get(label) ?? 0) + 1);
			importerRef.set(label, { kind: 'file', id: e.from });
		}
	} else {
		for (const e of edges) {
			const mod = topFolder(e.from);
			weights.set(mod, (weights.get(mod) ?? 0) + 1);
			if (!importerRef.has(mod)) {
				importerRef.set(mod, { kind: 'module', id: mod });
			}
		}
	}

	const ranked = [...weights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const kept = new Set(ranked.slice(0, maxImporters).map(([k]) => k));
	const hasOther = ranked.some(([k]) => !kept.has(k));

	const linkMap = new Map<string, number>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[fileLabel]: { kind: 'file', id: fileId },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(fileLabel, { category: 'File', color: TEAL.start });

	const otherLabel = '(other importers)';
	for (const [key, n] of weights) {
		const target = kept.has(key) ? key : otherLabel;
		const k = `${fileLabel}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + n);

		if (target === otherLabel) continue;
		const ref = importerRef.get(key);
		if (ref) nodeRef[target] = ref;
		nodeMeta.set(target, {
			category: 'Importers',
			color: useFiles ? TEAL.module : TEAL.module,
		});
	}
	if (hasOther) {
		nodeRef[otherLabel] = { kind: 'bucket', id: otherLabel };
		nodeMeta.set(otherLabel, { category: 'Importers', color: TEAL.other });
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['File', 'Importers'],
		focus,
		nodeRef,
		startId: fileId,
		units: 'import edges',
		ariaLabel: `Importers of ${fileId}`,
	});
}

/** Outgoing edge count from a file. */
export function fileOutDegree(graph: CodeGraph, fileId: string): number {
	let n = 0;
	for (const e of graph.edges) {
		if (e.from === fileId) n += 1;
	}
	return n;
}

/** Incoming file-import edges to a file. */
export function fileInDegree(graph: CodeGraph, fileId: string): number {
	let n = 0;
	for (const e of graph.edges) {
		if (e.toKind === 'file' && e.to === fileId) n += 1;
	}
	return n;
}

/**
 * Prefer reverse importers when fan-in dominates the file's edge activity.
 *
 * - Pure sinks (out=0, in>0): always reverse (logger.ts).
 * - Fan-in hubs (in > out): reverse so catalog "N edges" matches the chart
 *   (redis.ts has 12 importers + 2 outs — forward only shows ioredis→self).
 * - Outbound-heavy files: keep deps map (modules → code).
 */
export function preferFileImportersView(graph: CodeGraph, fileId: string): boolean {
	const out = fileOutDegree(graph, fileId);
	const inn = fileInDegree(graph, fileId);
	if (inn === 0) return false;
	if (out === 0) return true;
	return inn > out;
}
