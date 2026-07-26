/**
 * Dual-side file hub alluvial — high-edge / barrel projection.
 *
 * Columns (L→R): Importers → File → Exporters
 *
 * Flow unit: one observed import edge touching the focus file
 * (inbound file edges + outbound file/package/unresolved edges).
 * Left mass = in-degree; right mass = out-degree. The focus is not
 * mass-conserving across sides (in and out are independent).
 *
 * Importers (left) use teal; Exporters (right) use yellow so the two
 * sides read as distinct flows into/out of the hub.
 *
 * Used when a file has both fan-in and fan-out so catalog "N edges"
 * (in + out) is legible in one chart — e.g. barrel public.ts.
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
 * Project a file as a dual-side hub: importers left, exporters right.
 * Returns null when the file is missing or has no incident edges.
 */
export function projectFileHub(
	graph: CodeGraph,
	fileId: string,
	opts?: {
		heightPx?: number;
		maxImporters?: number;
		maxDeps?: number;
		maxModules?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 400;
	const maxImporters = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxDeps = opts?.maxDeps ?? DEFAULT_MAX_DEPS;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
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

	// focus.label must match the chart node name (may be path-disambiguated)
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

	// --- left: importers → hub ---
	if (inEdges.length) {
		const useModules = importerPaths.length > FILE_PROMOTE_THRESHOLD;
		if (useModules) {
			addImporterModules({
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
			addImporterFiles({
				graph,
				inEdges,
				importerPaths,
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

	// --- right: hub → exporters (outbound deps) ---
	if (outEdges.length) {
		addExporters({
			graph,
			outEdges,
			depFilePaths,
			labels,
			fileLabel,
			maxDeps,
			weightAxis,
			addLink,
			nodeRef,
			nodeMeta,
		});
	}

	// Drop nodes with no residual links
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

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['Importers', 'File', 'Exporters'],
		focus,
		nodeRef,
		startId: fileId,
		units,
		ariaLabel: `Hub importers and exporters for ${fileId}`,
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

function addImporterFiles(
	args: LinkBuilder & {
		inEdges: ImportEdge[];
		importerPaths: string[];
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
	const otherLabel = otherCount > 0 ? `+ ${otherCount} more importers` : '';

	for (const [key, n] of weights) {
		const source = kept.has(key) ? key : otherLabel;
		addLink(source, fileLabel, n);
		if (source === otherLabel) continue;
		const path = pathByLabel.get(key);
		if (path) nodeRef[source] = { kind: 'file', id: path };
		nodeMeta.set(source, { category: 'Importers', color: TEAL.module });
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-importers' };
		nodeMeta.set(otherLabel, { category: 'Importers', color: TEAL.other });
	}
}

function addImporterModules(
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
	const otherLabel = otherCount > 0 ? '(other importer modules)' : '';

	for (const [mod, n] of moduleWeights) {
		const source = kept.has(mod) ? mod : otherLabel;
		addLink(source, fileLabel, n);
		if (source === otherLabel) continue;
		nodeRef[source] = { kind: 'module', id: mod };
		nodeMeta.set(source, { category: 'Importers', color: TEAL.module });
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-importer-modules' };
		nodeMeta.set(otherLabel, { category: 'Importers', color: TEAL.other });
	}
}

function addExporters(
	args: LinkBuilder & {
		outEdges: ImportEdge[];
		depFilePaths: string[];
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
				// Packages / unresolved still yellow family so the whole
				// Exporters column reads as outbound (not teal import).
				color:
					e.toKind === 'unresolved' ? TEAL.exportOther : TEAL.exportPkg,
			});
		}
	}

	// Disambiguate display labels that collide across exporters
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
	const otherLabel = otherCount > 0 ? `+ ${otherCount} more` : '';

	for (const [key, entry] of byKey) {
		const target = keptKeys.has(key) ? entry.label : otherLabel;
		addLink(fileLabel, target, entry.weight);
		if (target === otherLabel) continue;
		nodeRef[target] = entry.ref;
		nodeMeta.set(target, { category: 'Exporters', color: entry.color });
	}
	if (otherCount > 0) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-exporters' };
		nodeMeta.set(otherLabel, { category: 'Exporters', color: TEAL.exportOther });
	}
}
