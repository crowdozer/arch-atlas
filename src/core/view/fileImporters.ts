/**
 * File reverse projection: who imports this file?
 *
 * Columns when ≤ FILE_PROMOTE_THRESHOLD importers:
 *   File → Importers (call-site files)
 *
 * Columns when many importers:
 *   File → Modules → Importers (call-site files)
 *
 * Intermediate folder groups are hops, not terminals. The rightmost column is
 * always the actual importer files (or an overflow bucket), so bands do not
 * stop at `client/sim` for hubs like config.ts.
 *
 * Used for fan-in hubs (e.g. logger.ts, config.ts) that show high edge counts
 * from inbound edges but have little/no outbound import surface.
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
const DEFAULT_MAX_MODULES = 12;
/** Cap call-site files promoted under each module hop (rest → overflow). */
const DEFAULT_MAX_FILES_PER_MODULE = 6;

/**
 * Pick a grouping function for many importers.
 * Prefer topFolder; if nearly all importers share one key, deepen one segment
 * so fan-in hubs (config.ts ← 186× under client/) are not a single band.
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

	// Dominant key is already two-level (client/sim) → deepen to three when possible.
	// Dominant key is one-level (client) → two-level or client/(files) for flat files.
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
 */
export function projectFileImporters(
	graph: CodeGraph,
	fileId: string,
	opts?: {
		heightPx?: number;
		maxImporters?: number;
		maxModules?: number;
		maxFilesPerModule?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 360;
	const maxImporters = opts?.maxImporters ?? 16;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
	const maxFilesPerModule = opts?.maxFilesPerModule ?? DEFAULT_MAX_FILES_PER_MODULE;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'import-edges');

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
	const useFilesOnly = importerPaths.length <= FILE_PROMOTE_THRESHOLD;

	if (useFilesOnly) {
		return projectFileImportersFlat({
			graph,
			fileId,
			fileLabel,
			focus,
			edges,
			importerPaths,
			heightPx,
			maxImporters,
			weightAxis,
			units,
		});
	}

	return projectFileImportersMultiHop({
		graph,
		fileId,
		fileLabel,
		focus,
		edges,
		importerPaths,
		heightPx,
		maxImporters,
		maxModules,
		maxFilesPerModule,
		weightAxis,
		units,
	});
}

type EdgeSlice = {
	graph: CodeGraph;
	fileId: string;
	fileLabel: string;
	focus: AlluvialFocus;
	edges: CodeGraph['edges'];
	importerPaths: string[];
	heightPx: number;
	maxImporters: number;
	weightAxis: WeightAxis;
	units: string;
};

/** Two-column reverse: File → call-site files. */
function projectFileImportersFlat(
	args: EdgeSlice,
): AlluvialPayload | null {
	const {
		graph,
		fileId,
		fileLabel,
		focus,
		edges,
		importerPaths,
		heightPx,
		maxImporters,
		weightAxis,
		units,
	} = args;

	const labels = uniqueFileLabels(importerPaths);
	const weights = new Map<string, number>();
	const importerRef = new Map<string, AlluvialNodeRef>();

	for (const e of edges) {
		const label = labels.get(e.from) ?? basename(e.from);
		weights.set(label, (weights.get(label) ?? 0) + edgeWeight(e, graph, weightAxis));
		importerRef.set(label, { kind: 'file', id: e.from });
	}

	const ranked = [...weights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const kept = new Set(ranked.slice(0, maxImporters).map(([k]) => k));
	const otherCount = ranked.filter(([k]) => !kept.has(k)).length;
	const hasOther = otherCount > 0;
	const otherLabel = moreCountLabel(otherCount);

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
		const ref = importerRef.get(key);
		if (ref) nodeRef[target] = ref;
		nodeMeta.set(target, { category: 'Importers', color: TEAL.module });
	}
	if (hasOther) {
		// Stable bucket id for inspect/drill; display name is "+ N more"
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-importers' };
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
		units,
		ariaLabel: `Importers of ${fileId}`,
	});
}

/**
 * Three-column reverse: File → Modules → call-site files.
 * Folders are intermediate hops; the right column is the call site.
 *
 * File promotion is **per module** so a fat band (client/sim × 80) still lands
 * on real call sites instead of draining entirely into a global overflow.
 */
function projectFileImportersMultiHop(
	args: EdgeSlice & { maxModules: number; maxFilesPerModule: number },
): AlluvialPayload | null {
	const {
		graph,
		fileId,
		fileLabel,
		focus,
		edges,
		importerPaths,
		heightPx,
		maxModules,
		maxFilesPerModule,
		weightAxis,
		units,
	} = args;

	const groupKey = importerGroupKey(importerPaths);

	// Per-file and per-module mass; files grouped under their module key
	const fileWeights = new Map<string, number>();
	const moduleWeights = new Map<string, number>();
	const filesByMod = new Map<string, string[]>();
	for (const e of edges) {
		const w = edgeWeight(e, graph, weightAxis);
		fileWeights.set(e.from, (fileWeights.get(e.from) ?? 0) + w);
		const mod = groupKey(e.from);
		moduleWeights.set(mod, (moduleWeights.get(mod) ?? 0) + w);
	}
	for (const path of fileWeights.keys()) {
		const mod = groupKey(path);
		const list = filesByMod.get(mod) ?? [];
		list.push(path);
		filesByMod.set(mod, list);
	}

	const rankedMods = [...moduleWeights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const keptMods = new Set(rankedMods.slice(0, maxModules).map(([k]) => k));
	const hasOtherMods = rankedMods.some(([k]) => !keptMods.has(k));

	// Promote call sites under each kept module (all if small, else top N)
	const keptFilePaths = new Set<string>();
	for (const mod of keptMods) {
		const local = (filesByMod.get(mod) ?? []).sort(
			(a, b) =>
				(fileWeights.get(b) ?? 0) - (fileWeights.get(a) ?? 0) ||
				a.localeCompare(b),
		);
		const cap =
			local.length <= FILE_PROMOTE_THRESHOLD
				? local.length
				: Math.min(maxFilesPerModule, local.length);
		for (const p of local.slice(0, cap)) keptFilePaths.add(p);
	}
	const otherFilePaths = [...fileWeights.keys()].filter((p) => !keptFilePaths.has(p));
	const hasOtherFiles = otherFilePaths.length > 0;
	const fileLabels = uniqueFileLabels([...keptFilePaths]);

	const otherFiles = moreCountLabel(otherFilePaths.length);
	const otherMods = '(other modules)';

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

	for (const e of edges) {
		const w = edgeWeight(e, graph, weightAxis);
		const modRaw = groupKey(e.from);
		const mod = keptMods.has(modRaw) ? modRaw : otherMods;
		const importerLabel = keptFilePaths.has(e.from)
			? (fileLabels.get(e.from) ?? basename(e.from))
			: otherFiles;

		addLink(fileLabel, mod, w);
		addLink(mod, importerLabel, w);

		if (mod !== otherMods) {
			nodeRef[mod] = { kind: 'module', id: modRaw };
			nodeMeta.set(mod, { category: 'Modules', color: TEAL.module });
		}
		if (importerLabel !== otherFiles) {
			nodeRef[importerLabel] = { kind: 'file', id: e.from };
			nodeMeta.set(importerLabel, { category: 'Importers', color: TEAL.start });
		}
	}

	if (hasOtherMods) {
		nodeRef[otherMods] = { kind: 'bucket', id: otherMods };
		nodeMeta.set(otherMods, { category: 'Modules', color: TEAL.other });
	}
	if (hasOtherFiles) {
		nodeRef[otherFiles] = { kind: 'bucket', id: 'other-importers' };
		nodeMeta.set(otherFiles, { category: 'Importers', color: TEAL.other });
	}

	// Drop nodes with no residual links (defensive)
	const used = new Set<string>();
	for (const k of linkMap.keys()) {
		const [s, t] = k.split('\0') as [string, string];
		used.add(s);
		used.add(t);
	}
	for (const name of [...nodeMeta.keys()]) {
		if (!used.has(name)) nodeMeta.delete(name);
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['File', 'Modules', 'Importers'],
		focus,
		nodeRef,
		startId: fileId,
		units,
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
