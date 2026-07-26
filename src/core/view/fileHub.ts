/**
 * Dual-side file hub alluvial — high-edge / barrel projection.
 *
 * Columns (L→R): Import hop N … → Imports → File → Exports → … Export hop N
 *
 * **Depth (viz-only)** is a dual-direction BFS hop **radius** around the focus:
 *
 * | Depth | Layout |
 * | ----- | ------ |
 * | 1     | Imports → File → Exports (1 hop each way; parity with classic hub) |
 * | N     | Up to N reverse hops (imports) and N forward hops (exports) |
 *
 * Radius = depth (not multiHop’s depth−1). Asymmetric sides omit empty hop columns.
 * Indexing/scan stays unbounded.
 *
 * **Mass:** route focus-incident edge weights through consecutive BFS rings.
 * File in-mass = depth-1 import total; File out-mass = depth-1 export total
 * (including packages/unresolved from focus). Outer rings carry routed mass only —
 * they do not union all edges in the radius.
 *
 * Integer multi-parent split (multiHop-style): a node with mass 1 and N outer
 * neighbors lights only one outer link (`floor(1/N)=0`, remainder to the first
 * path). Outer fan-out may therefore under-draw structure under unit edge
 * weights; accepted product default for conserving File incident mass.
 *
 * dist-1 categories stay `Imports` / `Exports`; outer rings `Import hop k` /
 * `Export hop k` (k≥2). Packages/unresolved appear only on export dist-1 from
 * focus out-edges. Folder collapse (importerGroupKey) only at depth=1.
 *
 * **Layer-consistent import topology:** d3-sankey columns = longest path from
 * sources. Dist-1 files with no outer importers would share a column with hop-2
 * sources (duplicate “Imports” headers). Shared zero-width import rails pad
 * short reverse paths so every BFS dist sits on one column (multiHop-style).
 *
 * Imports (left) teal; Exports (right) yellow. Carbon colors bands by source,
 * so File→Export strokes are recolored in the client polish step.
 */

import {
	fileDistances,
	fileImportAdj,
	fileImportedByAdj,
} from '@core/catalog/deepest.ts';
import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
	ImportEdge,
} from '@core/graph/types.ts';
import {
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
/** Barrel / hub default viz depth (hop radius both sides). */
export const HUB_DEFAULT_MAX_DEPTH = 3;
/** Non-hub multi-hop default (tree maps). */
export const NORMAL_DEFAULT_MAX_DEPTH = 7;

/**
 * True when the file has both inbound and outbound edge activity.
 *
 * Client open policy no longer routes with this helper — every file open uses
 * {@link projectFileHub} (one-sided columns when only in or only out). Kept for
 * metrics/tests and callers that want an explicit “both sides” check.
 */
export function preferFileHubView(graph: CodeGraph, fileId: string): boolean {
	const out = fileOutDegree(graph, fileId);
	const inn = fileInDegree(graph, fileId);
	return inn > 0 && out > 0;
}

/** dist-1 keeps Imports/Exports; outer rings are Import hop k / Export hop k. */
export function importHopCategory(dist: number): string {
	return dist <= 1 ? 'Imports' : `Import hop ${dist}`;
}

export function exportHopCategory(dist: number): string {
	return dist <= 1 ? 'Exports' : `Export hop ${dist}`;
}

/** Shared invisible rail for reverse-path padding at import hop stage s (s≥2). */
export function importRailId(stage: number): string {
	return `\u200b·in-rail·h${stage}`;
}

/**
 * Project a file as a dual-side hub: imports left, exports right.
 * Returns null when the file is missing or has no incident edges.
 *
 * @param opts.maxDepth Viz-only dual BFS radius (default {@link HUB_DEFAULT_MAX_DEPTH}).
 *   Scan is unbounded.
 */
export function projectFileHub(
	graph: CodeGraph,
	fileId: string,
	opts?: {
		heightPx?: number;
		maxImporters?: number;
		maxDeps?: number;
		maxModules?: number;
		/** Viz-only dual hop radius. Does not affect indexing. */
		maxDepth?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 400;
	const maxImporters = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxDeps = opts?.maxDeps ?? DEFAULT_MAX_DEPS;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
	const hubRadius = Math.max(1, Math.floor(opts?.maxDepth ?? HUB_DEFAULT_MAX_DEPTH));
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'import-edges');

	const inEdges = graph.edges.filter((e) => e.toKind === 'file' && e.to === fileId);
	const outEdges = graph.edges.filter((e) => e.from === fileId);
	if (!inEdges.length && !outEdges.length) return null;

	const importerPaths = [...new Set(inEdges.map((e) => e.from))];
	const depFilePaths = [
		...new Set(outEdges.filter((e) => e.toKind === 'file').map((e) => e.to)),
	];

	// Full path labels (chart polish right-truncates for display)
	const classicLabels = uniqueFileLabels([fileId, ...importerPaths, ...depFilePaths]);
	const fileLabel = classicLabels.get(fileId) ?? fileId

	const focus: AlluvialFocus = {
		kind: 'file',
		id: fileId,
		label: fileLabel,
	};

	const linkMap = new Map<string, number>();
	const addLink = (source: string, target: string, value: number) => {
		if (value <= 0 || source === target) return;
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	const nodeRef: Record<string, AlluvialNodeRef> = {
		[fileLabel]: { kind: 'file', id: fileId },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(fileLabel, { category: 'File', color: TEAL.start });

	// Shared display-name registry so import/export sides never collide
	const usedNames = new Set<string>([fileLabel]);

	// --- left: reverse BFS (importers) ---
	if (inEdges.length) {
		// Folder leaf collapse only at depth=1 when fan-in is large
		if (hubRadius === 1 && importerPaths.length > FILE_PROMOTE_THRESHOLD) {
			addImportModules({
				graph,
				inEdges,
				importerPaths,
				fileLabel,
				maxModules: Math.min(
					maxModules,
					Math.min(48, maxImporters /* depth=1 leaf budget */),
				),
				weightAxis,
				addLink,
				nodeRef,
				nodeMeta,
				usedNames,
			});
		} else {
			addImportRings({
				graph,
				fileId,
				fileLabel,
				inEdges,
				hubRadius,
				maxPerHop: Math.min(48, maxImporters),
				weightAxis,
				addLink,
				nodeRef,
				nodeMeta,
				usedNames,
				classicLabels,
			});
		}
	}

	// --- right: forward BFS (exports) + focus packages ---
	if (outEdges.length) {
		addExportRings({
			graph,
			fileId,
			fileLabel,
			outEdges,
			hubRadius,
			maxPerHop: Math.min(48, maxDeps),
			weightAxis,
			addLink,
			nodeRef,
			nodeMeta,
			usedNames,
			classicLabels,
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

	const present = new Set([...nodeMeta.values()].map((m) => m.category));
	const importHops: string[] = [];
	for (let d = hubRadius; d >= 2; d--) {
		const cat = importHopCategory(d);
		if (present.has(cat)) importHops.push(cat);
	}
	const exportHops: string[] = [];
	for (let d = 2; d <= hubRadius; d++) {
		const cat = exportHopCategory(d);
		if (present.has(cat)) exportHops.push(cat);
	}
	const categoryOrder = [
		...importHops,
		...(present.has('Imports') ? ['Imports'] : []),
		'File',
		...(present.has('Exports') ? ['Exports'] : []),
		...exportHops,
	].filter((c) => present.has(c) || c === 'File');

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId: fileId,
		units,
		ariaLabel: `Hub imports and exports for ${fileId} (viz depth ${hubRadius})`,
	});
}

type LinkBuilder = {
	graph: CodeGraph;
	weightAxis: WeightAxis;
	fileLabel: string;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
	usedNames: Set<string>;
};

/** Claim a display name; append side/kind marker when taken. */
function claimName(
	usedNames: Set<string>,
	preferred: string,
	fallbackSuffix: string,
): string {
	if (!usedNames.has(preferred)) {
		usedNames.add(preferred);
		return preferred;
	}
	const alt = `${preferred} · ${fallbackSuffix}`;
	if (!usedNames.has(alt)) {
		usedNames.add(alt);
		return alt;
	}
	let n = 2;
	while (usedNames.has(`${alt} ${n}`)) n += 1;
	const final = `${alt} ${n}`;
	usedNames.add(final);
	return final;
}

/** Teal hop gradient — closer to File is brighter. */
function importHopColor(dist: number, maxDist: number): string {
	const t = dist / Math.max(maxDist, 1);
	if (t > 0.75) return '#0f766e';
	if (t > 0.5) return '#0d9488';
	if (t > 0.25) return TEAL.package;
	return TEAL.module;
}

/** Yellow hop gradient — closer to File is brighter. */
function exportHopColor(dist: number, maxDist: number): string {
	const t = dist / Math.max(maxDist, 1);
	if (t > 0.75) return TEAL.exportOther;
	if (t > 0.5) return TEAL.exportPkg;
	return TEAL.export;
}

/**
 * Count file→file edges from `from` into any of `targets` (weight units via edges).
 */
function edgeWeightIntoSet(
	graph: CodeGraph,
	from: string,
	targets: ReadonlySet<string>,
	weightAxis: WeightAxis,
): number {
	if (!targets.size) return 0;
	let n = 0;
	for (const e of graph.edges) {
		if (e.from !== from || e.toKind !== 'file') continue;
		if (!targets.has(e.to)) continue;
		n += edgeWeight(e, graph, weightAxis);
	}
	return n;
}

/**
 * Reverse multi-hop: outer importers → … → Imports (dist-1) → File.
 * Mass = focus-incident reverse edges, routed outward for structure.
 * Outer hops ranked by connectivity into the kept inner ring.
 */
function addImportRings(
	args: LinkBuilder & {
		fileId: string;
		inEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
		classicLabels?: Map<string, string>;
	},
): void {
	const {
		graph,
		fileId,
		fileLabel,
		inEdges,
		hubRadius,
		maxPerHop,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
		classicLabels,
	} = args;

	const revAdj = fileImportedByAdj(graph); // file → who imports it
	const { dist, maxHops } = fileDistances(graph, fileId, revAdj);
	const radiusL = Math.min(hubRadius, maxHops);
	if (radiusL < 1) return;

	// Focus-incident mass on dist-1 importers
	const seedMass = new Map<string, number>();
	for (const e of inEdges) {
		const w = edgeWeight(e, graph, weightAxis);
		seedMass.set(e.from, (seedMass.get(e.from) ?? 0) + w);
	}

	const filesAt = new Map<number, string[]>();
	for (const [path, d] of dist) {
		if (d < 1 || d > radiusL) continue;
		const list = filesAt.get(d) ?? [];
		list.push(path);
		filesAt.set(d, list);
	}

	const display = new Map<string, string>();
	const keptByDist = new Map<number, string[]>();
	const mass = new Map<string, number>();

	// Build rings inside-out: dist-1 by seed mass; outer by connectivity into kept inner
	for (let d = 1; d <= radiusL; d++) {
		const files = filesAt.get(d) ?? [];
		const keptInner = new Set(keptByDist.get(d - 1) ?? []);
		const ranked = [...files].sort((a, b) => {
			const sa =
				d === 1
					? (seedMass.get(a) ?? 0)
					: edgeWeightIntoSet(graph, a, keptInner, weightAxis);
			const sb =
				d === 1
					? (seedMass.get(b) ?? 0)
					: edgeWeightIntoSet(graph, b, keptInner, weightAxis);
			return sb - sa || a.localeCompare(b);
		});
		const kept = ranked.slice(0, maxPerHop);
		const keptSet = new Set(kept);
		keptByDist.set(d, kept);
		const otherCount = ranked.length - kept.length;

		if (otherCount > 0) {
			const preferred =
				radiusL <= 1
					? moreCountLabel(otherCount)
					: hopOverflowLabel(moreCountLabel(otherCount), 'in', d);
			const otherName = claimName(usedNames, preferred, `in h${d}`);
			for (const f of files) {
				if (!keptSet.has(f)) display.set(f, otherName);
			}
			nodeRef[otherName] = { kind: 'bucket', id: `other-import-h${d}` };
			nodeMeta.set(otherName, {
				category: importHopCategory(d),
				color: TEAL.other,
			});
		}

		const pathLabels = classicLabels ?? uniqueFileLabels(kept);
		for (const f of kept) {
			const base = pathLabels.get(f) ?? f;
			const preferred = hopFileLabel(base, 'in', d, radiusL);
			const name = claimName(usedNames, preferred, `in h${d}`);
			display.set(f, name);
			nodeRef[name] = { kind: 'file', id: f };
			nodeMeta.set(name, {
				category: importHopCategory(d),
				color: importHopColor(d, radiusL),
			});
		}
	}

	// Seed mass at dist-1 (including overflow members so mass reaches File)
	for (const [f, w] of seedMass) {
		if ((dist.get(f) ?? 0) === 1) mass.set(f, w);
	}

	// dist-1 → File
	for (const f of filesAt.get(1) ?? []) {
		const m = mass.get(f) ?? 0;
		if (m <= 0) continue;
		const lab = display.get(f);
		if (!lab) continue;
		addLink(lab, fileLabel, m);
	}

	// Route mass outward: outer (d+1) → inner (d); include overflow via display.has
	for (let d = 1; d < radiusL; d++) {
		const filesHere = [...(filesAt.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of filesHere) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const innerLab = display.get(f);
			if (!innerLab) continue;

			const outer = (revAdj.get(f) ?? []).filter(
				(p) => dist.get(p) === d + 1 && display.has(p),
			);
			if (!outer.length) continue;

			const base = Math.floor(m / outer.length);
			let rem = m - base * outer.length;
			for (const p of outer) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				const outerLab = display.get(p)!;
				addLink(outerLab, innerLab, share);
				mass.set(p, (mass.get(p) ?? 0) + share);
			}
		}
	}

	// Pad short reverse paths so every BFS dist shares one sankey column.
	// Without this, dist-1 sources sit beside hop-2 sources → dual "Imports" headers.
	if (radiusL >= 2) {
		ensureImportRails(nodeMeta, nodeRef, radiusL);
		// Display names that already receive a real outer→inner reverse edge
		const receivesOuter = new Set<string>();
		for (let d = 1; d < radiusL; d++) {
			for (const f of filesAt.get(d) ?? []) {
				if ((mass.get(f) ?? 0) <= 0) continue;
				const innerLab = display.get(f);
				if (!innerLab) continue;
				const outer = (revAdj.get(f) ?? []).filter(
					(p) =>
						dist.get(p) === d + 1 &&
						display.has(p) &&
						(mass.get(p) ?? 0) > 0,
				);
				if (outer.length) receivesOuter.add(innerLab);
			}
		}

		for (let d = 1; d <= radiusL; d++) {
			for (const f of filesAt.get(d) ?? []) {
				const m = mass.get(f) ?? 0;
				if (m <= 0) continue;
				const lab = display.get(f);
				if (!lab) continue;
				if (receivesOuter.has(lab)) continue;
				padImportRailsInto(addLink, lab, d, radiusL, m);
			}
		}
	}
}

/** Register shared import rails (hidden labels) for stages 2..radius. */
function ensureImportRails(
	nodeMeta: Map<string, { category: string; color: string }>,
	nodeRef: Record<string, AlluvialNodeRef>,
	radiusL: number,
): void {
	for (let s = 2; s <= radiusL; s++) {
		const id = importRailId(s);
		if (nodeMeta.has(id)) continue;
		nodeMeta.set(id, {
			category: importHopCategory(s),
			color: importHopColor(s, radiusL),
		});
		nodeRef[id] = { kind: 'bucket', id };
	}
}

/**
 * Path rails radiusL → … → (dist+1) → target so longest-path layer matches BFS dist.
 * Only used when target has no outer reverse parent (would otherwise be a sankey source).
 */
function padImportRailsInto(
	addLink: (source: string, target: string, value: number) => void,
	targetLab: string,
	dist: number,
	radiusL: number,
	mass: number,
): void {
	if (mass <= 0 || dist >= radiusL) return;
	let prev: string | null = null;
	for (let stage = radiusL; stage > dist; stage--) {
		const rail = importRailId(stage);
		if (prev) addLink(prev, rail, mass);
		prev = rail;
	}
	if (prev) addLink(prev, targetLab, mass);
}

/**
 * Forward multi-hop: File → Exports (dist-1 files + pkgs) → … → Export hop N.
 * Mass = focus-incident out edges; packages only from focus on dist-1.
 * Outer hops ranked by connectivity from the kept inner ring; overflow buckets
 * receive routed mass (file or bucket via display map).
 */
function addExportRings(
	args: LinkBuilder & {
		fileId: string;
		outEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
		classicLabels?: Map<string, string>;
	},
): void {
	const {
		graph,
		fileId,
		fileLabel,
		outEdges,
		hubRadius,
		maxPerHop,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
		classicLabels,
	} = args;

	const fwdAdj = fileImportAdj(graph);
	const { dist, maxHops } = fileDistances(graph, fileId, fwdAdj);
	// Packages-only (no file hop) still needs a dist-1 Exports column
	const radiusR = Math.min(hubRadius, Math.max(maxHops, 1));

	// Seed mass from focus out-edges
	type NonFileDep = {
		preferredLabel: string;
		weight: number;
		ref: AlluvialNodeRef;
		color: string;
		key: string;
	};
	const fileSeed = new Map<string, number>();
	const nonFile = new Map<string, NonFileDep>();

	for (const e of outEdges) {
		const w = edgeWeight(e, graph, weightAxis);
		if (e.toKind === 'file') {
			fileSeed.set(e.to, (fileSeed.get(e.to) ?? 0) + w);
			continue;
		}
		const pkgLabel =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const key = `${e.toKind}:${e.to}`;
		const prev = nonFile.get(key);
		if (prev) prev.weight += w;
		else {
			nonFile.set(key, {
				key,
				preferredLabel: pkgLabel,
				weight: w,
				ref: {
					kind: e.toKind === 'unresolved' ? 'unresolved' : 'package',
					id: e.to,
				},
				color: e.toKind === 'unresolved' ? TEAL.exportOther : TEAL.exportPkg,
			});
		}
	}

	const filesAt = new Map<number, string[]>();
	for (const [path, d] of dist) {
		if (d < 1 || d > radiusR) continue;
		const list = filesAt.get(d) ?? [];
		list.push(path);
		filesAt.set(d, list);
	}

	const display = new Map<string, string>();
	const keptByDist = new Map<number, string[]>();
	const mass = new Map<string, number>();

	// --- dist-1: combined files + packages under maxPerHop (classic maxDeps) ---
	type RankedExport = {
		kind: 'file' | 'nonfile';
		key: string;
		weight: number;
		preferredLabel: string;
		entry?: NonFileDep;
	};
	const dist1Candidates = filesAt.get(1) ?? [];
	const dist1Labels =
		classicLabels ?? uniqueFileLabels(dist1Candidates);
	const combined: RankedExport[] = [];
	for (const f of dist1Candidates) {
		combined.push({
			kind: 'file',
			key: f,
			weight: fileSeed.get(f) ?? 0,
			preferredLabel: hopFileLabel(
				dist1Labels.get(f) ?? f,
				'out',
				1,
				radiusR,
			),
		});
	}
	const pkgLabelCount = new Map<string, number>();
	for (const entry of nonFile.values()) {
		pkgLabelCount.set(
			entry.preferredLabel,
			(pkgLabelCount.get(entry.preferredLabel) ?? 0) + 1,
		);
	}
	for (const [key, entry] of nonFile) {
		let preferred = entry.preferredLabel;
		if ((pkgLabelCount.get(preferred) ?? 0) > 1) {
			preferred = `${preferred} · ${entry.ref.kind}`;
		}
		combined.push({
			kind: 'nonfile',
			key,
			weight: entry.weight,
			preferredLabel: preferred,
			entry,
		});
	}
	combined.sort(
		(a, b) => b.weight - a.weight || a.preferredLabel.localeCompare(b.preferredLabel),
	);

	const keptCombined = combined.slice(0, maxPerHop);
	const overflowCombined = combined.slice(maxPerHop);
	const exportOtherLabel =
		overflowCombined.length > 0
			? claimName(
					usedNames,
					radiusR <= 1
						? moreCountLabel(overflowCombined.length)
						: hopOverflowLabel(
								moreCountLabel(overflowCombined.length),
								'out',
								1,
							),
					'exports',
				)
			: '';

	const keptDist1Files: string[] = [];
	for (const item of keptCombined) {
		if (item.kind === 'file') {
			const w = item.weight;
			if (w <= 0) continue;
			const name = claimName(usedNames, item.preferredLabel, 'out');
			display.set(item.key, name);
			nodeRef[name] = { kind: 'file', id: item.key };
			nodeMeta.set(name, {
				category: 'Exports',
				color: exportHopColor(1, radiusR),
			});
			mass.set(item.key, w);
			addLink(fileLabel, name, w);
			keptDist1Files.push(item.key);
		} else if (item.entry) {
			const name = claimName(usedNames, item.preferredLabel, item.entry.ref.kind);
			addLink(fileLabel, name, item.weight);
			nodeRef[name] = item.entry.ref;
			nodeMeta.set(name, {
				category: 'Exports',
				color: item.entry.color,
			});
		}
	}

	// Overflow dist-1 (files + packages) still contribute File out-mass
	for (const item of overflowCombined) {
		if (!exportOtherLabel) continue;
		addLink(fileLabel, exportOtherLabel, item.weight);
		if (item.kind === 'file') {
			display.set(item.key, exportOtherLabel);
			// No further hop routing from overflowed dist-1 files unless they
			// share display — mass already spent into overflow bucket at File.
		}
	}
	if (exportOtherLabel) {
		nodeRef[exportOtherLabel] = { kind: 'bucket', id: 'other-exports' };
		nodeMeta.set(exportOtherLabel, {
			category: 'Exports',
			color: TEAL.exportOther,
		});
	}
	keptByDist.set(1, keptDist1Files);

	// --- outer hops: rank by connectivity from kept inner; route mass ---
	for (let d = 2; d <= radiusR; d++) {
		const files = filesAt.get(d) ?? [];
		const keptInner = new Set(keptByDist.get(d - 1) ?? []);
		const ranked = [...files].sort((a, b) => {
			// Connectivity: edges from kept parents at d−1 into candidate
			const sa = edgeWeightFromSet(graph, keptInner, a, weightAxis);
			const sb = edgeWeightFromSet(graph, keptInner, b, weightAxis);
			return sb - sa || a.localeCompare(b);
		});
		const kept = ranked.slice(0, maxPerHop);
		const keptSet = new Set(kept);
		keptByDist.set(d, kept);
		const otherCount = ranked.length - kept.length;

		if (otherCount > 0) {
			const preferred = hopOverflowLabel(moreCountLabel(otherCount), 'out', d);
			const otherName = claimName(usedNames, preferred, `out h${d}`);
			for (const f of files) {
				if (!keptSet.has(f)) display.set(f, otherName);
			}
			nodeRef[otherName] = { kind: 'bucket', id: `other-export-h${d}` };
			nodeMeta.set(otherName, {
				category: exportHopCategory(d),
				color: TEAL.exportOther,
			});
		}

		const pathLabels = uniqueFileLabels(kept);
		for (const f of kept) {
			const base = pathLabels.get(f) ?? f;
			const preferred = hopFileLabel(base, 'out', d, radiusR);
			const name = claimName(usedNames, preferred, `out h${d}`);
			display.set(f, name);
			nodeRef[name] = { kind: 'file', id: f };
			nodeMeta.set(name, {
				category: exportHopCategory(d),
				color: exportHopColor(d, radiusR),
			});
		}

		// Route mass from dist d−1 → d (file or overflow bucket via display)
		const parents = [...(filesAt.get(d - 1) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of parents) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const fromLab = display.get(f);
			if (!fromLab) continue;
			// Skip if parent was folded into dist-1 overflow bucket only (no file node)
			if (nodeRef[fromLab]?.kind === 'bucket' && (dist.get(f) ?? 0) === 1) {
				// Dist-1 overflow: mass already linked File → overflow; do not fan out
				continue;
			}

			const children = (fwdAdj.get(f) ?? []).filter(
				(c) => dist.get(c) === d && display.has(c),
			);
			if (!children.length) continue;

			const base = Math.floor(m / children.length);
			let rem = m - base * children.length;
			for (const c of children) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				const toLab = display.get(c)!;
				addLink(fromLab, toLab, share);
				mass.set(c, (mass.get(c) ?? 0) + share);
			}
		}
	}
}

/** Sum edge weights from any of `froms` into `to`. */
function edgeWeightFromSet(
	graph: CodeGraph,
	froms: ReadonlySet<string>,
	to: string,
	weightAxis: WeightAxis,
): number {
	if (!froms.size) return 0;
	let n = 0;
	for (const e of graph.edges) {
		if (e.toKind !== 'file' || e.to !== to) continue;
		if (!froms.has(e.from)) continue;
		n += edgeWeight(e, graph, weightAxis);
	}
	return n;
}

/** Display label: plain at dist-1 when single-hop; hop/side suffix when multi-hop. */
function hopFileLabel(
	base: string,
	side: 'in' | 'out',
	dist: number,
	radius: number,
): string {
	if (radius <= 1 && dist <= 1) return base;
	if (dist <= 1) return `${base} · ${side}`;
	return `${base} · ${side} h${dist}`;
}

function hopOverflowLabel(
	base: string,
	side: 'in' | 'out',
	dist: number,
): string {
	return `${base} · ${side} h${dist}`;
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
		usedNames,
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
	const otherLabel =
		otherCount > 0 ? claimName(usedNames, moreCountLabel(otherCount), 'imports') : '';

	for (const [mod, n] of moduleWeights) {
		if (kept.has(mod)) {
			const source = claimName(usedNames, mod, 'module');
			addLink(source, fileLabel, n);
			nodeRef[source] = { kind: 'module', id: mod };
			nodeMeta.set(source, { category: 'Imports', color: TEAL.module });
		} else if (otherLabel) {
			addLink(otherLabel, fileLabel, n);
		}
	}
	if (otherLabel) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-import-modules' };
		nodeMeta.set(otherLabel, { category: 'Imports', color: TEAL.other });
	}
}
