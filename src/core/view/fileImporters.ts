/**
 * File reverse projection: who imports this file?
 *
 * Columns (L→R): File → Imports
 *
 * **Folders are not hop depth.** Every reverse edge is already one import hop
 * (A imports logger). Path prefixes (app/, src/services, (root)) are only used
 * as optional *leaf labels* when there are too many call sites to list — never
 * as an intermediate depth column.
 *
 * maxDepth (viz-only) scales how many call sites we promote before overflow;
 * it does not invent folder stages. Graph scan stays unbounded.
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
	moreCountLabel,
	TEAL,
	topFolder,
	uniqueFileLabels,
	type WeightAxis,
} from '@core/view/alluvial.ts';
import {
	edgeWeight,
	resolveWeightAxis,
	unitsForAxis,
} from '@core/view/weight.ts';

const FILE_PROMOTE_THRESHOLD = 12;
const DEFAULT_MAX_IMPORTERS = 16;

/**
 * Pick a grouping function for many importers (leaf labels only).
 * Prefer topFolder; if nearly all importers share one key, deepen one segment
 * so fan-in hubs are not a single band.
 */
export function importerGroupKey(
	importerPaths: readonly string[],
): (path: string) => string {
	const byTop = new Map<string, number>();
	for (const p of importerPaths) {
		const k = topFolder(p);
		byTop.set(k, (byTop.get(k) ?? 0) + 1);
	}
	const ranked = [...byTop.entries()].sort((a, b) => b[1] - a[1]);
	const [dominant, dominantN] = ranked[0] ?? ['', 0];
	const collapse =
		ranked.length <= 1 ||
		(importerPaths.length >= 8 && dominantN / importerPaths.length >= 0.85);

	if (!collapse || !dominant || dominant === '(root)') {
		return (path: string) => topFolder(path);
	}

	const domParts = dominant.split('/');
	return (path: string) => {
		const parts = path.split('/').filter(Boolean);
		if (domParts.length >= 2) {
			if (parts.length >= 4) return parts.slice(0, 3).join('/');
			if (parts.length >= 3) return parts.slice(0, 2).join('/');
			return topFolder(path);
		}
		if (parts.length >= 3) return `${parts[0]}/${parts[1]}`;
		if (parts.length === 2) return `${parts[0]}/(files)`;
		return topFolder(path);
	};
}

/**
 * Project importers of a source file as an alluvial.
 * Returns null when nothing imports the file.
 *
 * @param opts.maxDepth Viz-only: higher depth promotes more call-site files
 *   before "+ N more". Does not add folder hop stages.
 */
export function projectFileImporters(
	graph: CodeGraph,
	fileId: string,
	opts?: {
		heightPx?: number;
		maxImporters?: number;
		maxModules?: number;
		maxFilesPerModule?: number;
		maxDepth?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 360;
	const maxDepth = Math.max(1, opts?.maxDepth ?? 7);
	// Depth scales leaf budget only (not folder stages)
	const baseMax = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxImporters = Math.min(48, baseMax + Math.max(0, maxDepth - 1) * 4);
	const maxModules = opts?.maxModules ?? 12;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'import-edges');

	const edges = graph.edges.filter((e) => e.toKind === 'file' && e.to === fileId);
	if (!edges.length) return null;

	const focus: AlluvialFocus = {
		kind: 'file',
		id: fileId,
		label: basename(fileId),
	};
	const labelsForFocus = uniqueFileLabels([fileId, ...edges.map((e) => e.from)]);
	const fileLabel = labelsForFocus.get(fileId) ?? basename(fileId);
	const importerPaths = [...new Set(edges.map((e) => e.from))];

	// Few importers → list files. Many → folder *leaves* (still one Imports column).
	if (importerPaths.length <= FILE_PROMOTE_THRESHOLD) {
		return projectImportsColumn({
			graph,
			fileId,
			fileLabel,
			focus,
			edges,
			mode: 'files',
			heightPx,
			maxLeaves: maxImporters,
			weightAxis,
			units,
		});
	}

	return projectImportsColumn({
		graph,
		fileId,
		fileLabel,
		focus,
		edges,
		mode: 'folders',
		heightPx,
		maxLeaves: maxModules,
		weightAxis,
		units,
	});
}

function projectImportsColumn(args: {
	graph: CodeGraph;
	fileId: string;
	fileLabel: string;
	focus: AlluvialFocus;
	edges: CodeGraph['edges'];
	mode: 'files' | 'folders';
	heightPx: number;
	maxLeaves: number;
	weightAxis: WeightAxis;
	units: string;
}): AlluvialPayload | null {
	const {
		graph,
		fileId,
		fileLabel,
		focus,
		edges,
		mode,
		heightPx,
		maxLeaves,
		weightAxis,
		units,
	} = args;

	const weights = new Map<string, number>();
	const leafRef = new Map<string, AlluvialNodeRef>();

	if (mode === 'files') {
		const paths = [...new Set(edges.map((e) => e.from))];
		const labels = uniqueFileLabels(paths);
		for (const e of edges) {
			const label = labels.get(e.from) ?? basename(e.from);
			weights.set(label, (weights.get(label) ?? 0) + edgeWeight(e, graph, weightAxis));
			leafRef.set(label, { kind: 'file', id: e.from });
		}
	} else {
		const paths = [...new Set(edges.map((e) => e.from))];
		const groupKey = importerGroupKey(paths);
		for (const e of edges) {
			const mod = groupKey(e.from);
			weights.set(mod, (weights.get(mod) ?? 0) + edgeWeight(e, graph, weightAxis));
			if (!leafRef.has(mod)) {
				leafRef.set(mod, { kind: 'module', id: mod });
			}
		}
	}

	const ranked = [...weights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const kept = new Set(ranked.slice(0, maxLeaves).map(([k]) => k));
	const otherCount = ranked.filter(([k]) => !kept.has(k)).length;
	const otherLabel = otherCount > 0 ? moreCountLabel(otherCount) : '';

	const linkMap = new Map<string, number>();
	const addLink = (source: string, target: string, value: number) => {
		if (value <= 0) return;
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	const nodeRef: Record<string, AlluvialNodeRef> = {
		[fileLabel]: { kind: 'file', id: fileId },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(fileLabel, { category: 'File', color: TEAL.start });

	for (const [key, n] of weights) {
		const target = kept.has(key) ? key : otherLabel;
		addLink(fileLabel, target, n);
		if (target === otherLabel) continue;
		const ref = leafRef.get(key);
		if (ref) nodeRef[target] = ref;
		// Folder keys and files both live under Imports — not a depth stage
		nodeMeta.set(target, {
			category: 'Imports',
			color: mode === 'folders' ? TEAL.package : TEAL.module,
		});
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-imports' };
		nodeMeta.set(otherLabel, { category: 'Imports', color: TEAL.other });
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['File', 'Imports'],
		focus,
		nodeRef,
		startId: fileId,
		units,
		ariaLabel: `Imports of ${fileId}`,
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
 * - Fan-in hubs (in > out): reverse so catalog "N edges" matches the chart.
 * - Outbound-heavy files: keep deps map (modules → code).
 */
export function preferFileImportersView(graph: CodeGraph, fileId: string): boolean {
	const out = fileOutDegree(graph, fileId);
	const inn = fileInDegree(graph, fileId);
	if (inn === 0) return false;
	if (out === 0) return true;
	return inn > out;
}
