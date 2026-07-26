/**
 * Dual-side file hub alluvial — high-edge / barrel projection.
 *
 * Columns (L→R): Imports → File → Exports
 *
 * **Depth (viz-only)** — one hop each direction at depth 1; expand import
 * folders → call-site files when depth ≥ 2 (exports stay one hop outbound).
 * Indexing/scan stays unbounded.
 *
 * Flow unit: one observed import edge touching the focus file
 * (inbound file edges + outbound file/package/unresolved edges).
 * Left mass = in-degree; right mass = out-degree. The focus is not
 * mass-conserving across sides (in and out are independent).
 *
 * Imports (left) teal; Exports (right) yellow. Carbon colors bands by
 * source, so File→Export strokes are recolored in the client polish step.
 */

import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
	ImportEdge,
} from '@core/graph/types.ts';
import {
	basename,
	buildAlluvialPayload,
	moreCountLabel,
	TEAL,
	uniqueFileLabels,
	type WeightAxis,
} from '@core/view/alluvial.ts';
import {
	fileInDegree,
	fileOutDegree,
	importerGroupKey,
} from '@core/view/fileImporters.ts';
import {
	edgeWeight,
	resolveWeightAxis,
	unitsForAxis,
} from '@core/view/weight.ts';

const FILE_PROMOTE_THRESHOLD = 12;
const DEFAULT_MAX_IMPORTERS = 16;
const DEFAULT_MAX_DEPS = 16;
const DEFAULT_MAX_MODULES = 12;
/** Barrel / hub default viz depth (folder hop + files). */
export const HUB_DEFAULT_MAX_DEPTH = 3;
/** Non-hub multi-hop default (tree maps). */
export const NORMAL_DEFAULT_MAX_DEPTH = 7;

/**
 * Prefer dual hub when the file has both inbound and outbound edge activity.
 * Pure sinks → reverse importers; pure sources → forward package map.
 */
export function preferFileHubView(graph: CodeGraph, fileId: string): boolean {
	const out = fileOutDegree(graph, fileId);
	const inn = fileInDegree(graph, fileId);
	return inn > 0 && out > 0;
}

/**
 * Project a file as a dual-side hub: imports left, exports right.
 * Returns null when the file is missing or has no incident edges.
 *
 * @param opts.maxDepth Viz-only hop budget for expanding import folders
 *   into call-site files (default {@link HUB_DEFAULT_MAX_DEPTH}). Scan is unbounded.
 */
export function projectFileHub(
	graph: CodeGraph,
	fileId: string,
	opts?: {
		heightPx?: number;
		maxImporters?: number;
		maxDeps?: number;
		maxModules?: number;
		/** Viz-only import expansion depth. Does not affect indexing. */
		maxDepth?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 400;
	const maxImporters = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxDeps = opts?.maxDeps ?? DEFAULT_MAX_DEPS;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
	const maxDepth = Math.max(1, opts?.maxDepth ?? HUB_DEFAULT_MAX_DEPTH);
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'import-edges');

	const inEdges = graph.edges.filter((e) => e.toKind === 'file' && e.to === fileId);
	const outEdges = graph.edges.filter((e) => e.from === fileId);
	if (!inEdges.length && !outEdges.length) return null;

	const importerPaths = [...new Set(inEdges.map((e) => e.from))];
	const depFilePaths = [
		...new Set(outEdges.filter((e) => e.toKind === 'file').map((e) => e.to)),
	];
	const allFilePaths = [fileId, ...importerPaths, ...depFilePaths];
	const labels = uniqueFileLabels(allFilePaths);
	const fileLabel = labels.get(fileId) ?? basename(fileId);

	const focus: AlluvialFocus = {
		kind: 'file',
		id: fileId,
		label: fileLabel,
	};

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

	// --- left: imports → hub ---
	// Depth 1: one hop of importers (files or folders). Depth ≥ 2: hop past
	// folders to call-site files when the importer set is large.
	if (inEdges.length) {
		const expandPastFolders =
			maxDepth >= 2 && importerPaths.length > FILE_PROMOTE_THRESHOLD;
		if (expandPastFolders) {
			addImportsMultiHop({
				graph,
				inEdges,
				importerPaths,
				fileLabel,
				maxModules,
				maxImporters,
				maxDepth,
				weightAxis,
				addLink,
				nodeRef,
				nodeMeta,
			});
		} else if (importerPaths.length > FILE_PROMOTE_THRESHOLD) {
			// Depth 1 with many importers: folder buckets only (one hop)
			addImportModules({
				graph,
				inEdges,
				importerPaths,
				fileLabel,
				maxModules,
				weightAxis,
				addLink,
				nodeRef,
				nodeMeta,
			});
		} else {
			addImportFiles({
				graph,
				inEdges,
				labels,
				fileLabel,
				maxImporters,
				weightAxis,
				addLink,
				nodeRef,
				nodeMeta,
			});
		}
	}

	// --- right: hub → exports ---
	if (outEdges.length) {
		addExports({
			graph,
			outEdges,
			labels,
			fileLabel,
			maxDeps,
			weightAxis,
			addLink,
			nodeRef,
			nodeMeta,
		});
	}

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
	if (!links.length) return null;

	// Category order: folder hop (if any), then call sites, file, exports
	const hasFolders = [...nodeMeta.values()].some((m) => m.category === 'Import folders');
	const hasImportFiles = [...nodeMeta.values()].some((m) => m.category === 'Imports');
	const categoryOrder = [
		...(hasFolders ? ['Import folders'] : []),
		...(hasImportFiles ? ['Imports'] : []),
		'File',
		'Exports',
	].filter((c, i, arr) => arr.indexOf(c) === i);

	// Ensure File present even if only one side has data
	if (!categoryOrder.includes('File')) categoryOrder.splice(-1, 0, 'File');

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId: fileId,
		units,
		ariaLabel: `Hub imports and exports for ${fileId}`,
	});
}

type LinkBuilder = {
	graph: CodeGraph;
	weightAxis: WeightAxis;
	fileLabel: string;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
};

function addImportFiles(
	args: LinkBuilder & {
		inEdges: ImportEdge[];
		labels: Map<string, string>;
		maxImporters: number;
	},
): void {
	const {
		graph,
		inEdges,
		labels,
		fileLabel,
		maxImporters,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
	} = args;

	const weights = new Map<string, number>();
	const pathByLabel = new Map<string, string>();
	for (const e of inEdges) {
		const label = labels.get(e.from) ?? basename(e.from);
		weights.set(label, (weights.get(label) ?? 0) + edgeWeight(e, graph, weightAxis));
		pathByLabel.set(label, e.from);
	}

	const ranked = [...weights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const kept = new Set(ranked.slice(0, maxImporters).map(([k]) => k));
	const otherCount = ranked.filter(([k]) => !kept.has(k)).length;
	const otherLabel = otherCount > 0 ? moreCountLabel(otherCount) : '';

	for (const [key, n] of weights) {
		const source = kept.has(key) ? key : otherLabel;
		addLink(source, fileLabel, n);
		if (source === otherLabel) continue;
		const path = pathByLabel.get(key);
		if (path) nodeRef[source] = { kind: 'file', id: path };
		nodeMeta.set(source, { category: 'Imports', color: TEAL.module });
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-imports' };
		nodeMeta.set(otherLabel, { category: 'Imports', color: TEAL.other });
	}
}

function addImportModules(
	args: LinkBuilder & {
		inEdges: ImportEdge[];
		importerPaths: string[];
		maxModules: number;
	},
): void {
	const {
		graph,
		inEdges,
		importerPaths,
		fileLabel,
		maxModules,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
	} = args;

	const groupKey = importerGroupKey(importerPaths);
	const moduleWeights = new Map<string, number>();
	for (const e of inEdges) {
		const mod = groupKey(e.from);
		moduleWeights.set(
			mod,
			(moduleWeights.get(mod) ?? 0) + edgeWeight(e, graph, weightAxis),
		);
	}

	const ranked = [...moduleWeights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const kept = new Set(ranked.slice(0, maxModules).map(([k]) => k));
	const otherCount = ranked.filter(([k]) => !kept.has(k)).length;
	const otherLabel = otherCount > 0 ? moreCountLabel(otherCount) : '';

	for (const [mod, n] of moduleWeights) {
		const source = kept.has(mod) ? mod : otherLabel;
		addLink(source, fileLabel, n);
		if (source === otherLabel) continue;
		nodeRef[source] = { kind: 'module', id: mod };
		// Folder-only: still under Imports when no file hop
		nodeMeta.set(source, { category: 'Imports', color: TEAL.module });
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-import-modules' };
		nodeMeta.set(otherLabel, { category: 'Imports', color: TEAL.other });
	}
}

/**
 * Folders → call-site files → hub. Restores hopping past folders when
 * maxDepth ≥ 2 and importer count is large.
 */
function addImportsMultiHop(
	args: LinkBuilder & {
		inEdges: ImportEdge[];
		importerPaths: string[];
		maxModules: number;
		maxImporters: number;
		maxDepth: number;
	},
): void {
	const {
		graph,
		inEdges,
		importerPaths,
		fileLabel,
		maxModules,
		maxImporters,
		maxDepth,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
	} = args;

	const groupKey = importerGroupKey(importerPaths);

	// Per-file mass + files under each module
	const fileWeights = new Map<string, number>();
	const moduleWeights = new Map<string, number>();
	const filesByMod = new Map<string, string[]>();
	for (const e of inEdges) {
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
	const otherModCount = rankedMods.filter(([k]) => !keptMods.has(k)).length;
	const otherMods = otherModCount > 0 ? moreCountLabel(otherModCount) : '';

	// Per-module promote files (depth ≥ 2 always promotes files here)
	const maxFilesPerModule = Math.max(
		3,
		Math.min(6, Math.floor(maxImporters / Math.max(1, keptMods.size))),
	);
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
		// maxDepth>2: keep more files per module (viz budget scales with depth)
		const depthBonus =
			maxDepth >= 3 ? Math.min(local.length, cap + (maxDepth - 2) * 2) : cap;
		for (const p of local.slice(0, depthBonus)) keptFilePaths.add(p);
	}
	const otherFilePaths = [...fileWeights.keys()].filter((p) => !keptFilePaths.has(p));
	const otherFiles = otherFilePaths.length > 0 ? moreCountLabel(otherFilePaths.length) : '';
	const fileLabels = uniqueFileLabels([...keptFilePaths]);

	for (const e of inEdges) {
		const w = edgeWeight(e, graph, weightAxis);
		const modRaw = groupKey(e.from);
		const mod = keptMods.has(modRaw) ? modRaw : otherMods;
		const fileLab = keptFilePaths.has(e.from)
			? (fileLabels.get(e.from) ?? basename(e.from))
			: otherFiles;

		// folder → file → hub
		if (mod) addLink(mod, fileLab, w);
		addLink(fileLab, fileLabel, w);

		if (mod && mod !== otherMods) {
			nodeRef[mod] = { kind: 'module', id: modRaw };
			nodeMeta.set(mod, { category: 'Import folders', color: TEAL.package });
		}
		if (fileLab !== otherFiles) {
			nodeRef[fileLab] = { kind: 'file', id: e.from };
			nodeMeta.set(fileLab, { category: 'Imports', color: TEAL.module });
		}
	}

	if (otherModCount > 0 && otherMods) {
		nodeRef[otherMods] = { kind: 'bucket', id: 'other-import-folders' };
		nodeMeta.set(otherMods, { category: 'Import folders', color: TEAL.other });
	}
	if (otherFilePaths.length > 0 && otherFiles) {
		nodeRef[otherFiles] = { kind: 'bucket', id: 'other-imports' };
		nodeMeta.set(otherFiles, { category: 'Imports', color: TEAL.other });
	}
}

function addExports(
	args: LinkBuilder & {
		outEdges: ImportEdge[];
		labels: Map<string, string>;
		maxDeps: number;
	},
): void {
	const {
		graph,
		outEdges,
		labels,
		fileLabel,
		maxDeps,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
	} = args;

	type DepEntry = {
		label: string;
		weight: number;
		ref: AlluvialNodeRef;
		color: string;
	};

	const byKey = new Map<string, DepEntry>();
	for (const e of outEdges) {
		const w = edgeWeight(e, graph, weightAxis);
		if (e.toKind === 'file') {
			const label = labels.get(e.to) ?? basename(e.to);
			const prev = byKey.get(`file:${e.to}`);
			if (prev) prev.weight += w;
			else {
				byKey.set(`file:${e.to}`, {
					label,
					weight: w,
					ref: { kind: 'file', id: e.to },
					color: TEAL.export,
				});
			}
			continue;
		}
		const pkgLabel =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const key = `${e.toKind}:${e.to}`;
		const prev = byKey.get(key);
		if (prev) prev.weight += w;
		else {
			byKey.set(key, {
				label: pkgLabel,
				weight: w,
				ref: {
					kind: e.toKind === 'unresolved' ? 'unresolved' : 'package',
					id: e.to,
				},
				color: e.toKind === 'unresolved' ? TEAL.exportOther : TEAL.exportPkg,
			});
		}
	}

	const labelOwners = new Map<string, string[]>();
	for (const [key, entry] of byKey) {
		const list = labelOwners.get(entry.label) ?? [];
		list.push(key);
		labelOwners.set(entry.label, list);
	}
	for (const keys of labelOwners.values()) {
		if (keys.length <= 1) continue;
		for (const key of keys) {
			const entry = byKey.get(key)!;
			entry.label = `${entry.label} · ${entry.ref.kind}`;
		}
	}

	const ranked = [...byKey.entries()].sort(
		(a, b) =>
			b[1].weight - a[1].weight || a[1].label.localeCompare(b[1].label),
	);
	const keptKeys = new Set(ranked.slice(0, maxDeps).map(([k]) => k));
	const otherCount = ranked.filter(([k]) => !keptKeys.has(k)).length;
	const otherLabel = otherCount > 0 ? moreCountLabel(otherCount) : '';

	for (const [key, entry] of byKey) {
		const target = keptKeys.has(key) ? entry.label : otherLabel;
		addLink(fileLabel, target, entry.weight);
		if (target === otherLabel) continue;
		nodeRef[target] = entry.ref;
		nodeMeta.set(target, { category: 'Exports', color: entry.color });
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-exports' };
		nodeMeta.set(otherLabel, { category: 'Exports', color: TEAL.exportOther });
	}
}
