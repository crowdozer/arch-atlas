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
 * **Mass:** route focus-incident edge weights through consecutive rings.
 * File in-mass = reverse edge total; File out-mass = focus out-edge total
 * (including packages/unresolved from focus).
 *
 * **Package leaves** ({@link PackageLeafMode}):
 * - `pin-overdraw` (default): one node per package id, pinned at max hop among
 *   importers in the export tree; short parents pad through out-rails. May
 *   draw hop columns past Depth when a leaf sits further out.
 * - `pin-clip`: same pin-far identity, but pin dist is clipped to Depth (no
 *   overdraw); appearances that would land past the rim are dropped.
 * - `per-hop` (legacy): package leaf at each importer’s d+1 (one node per
 *   package id per hop), never same-column as parent.
 *
 * Integer multi-parent split (multiHop-style): a node with mass 1 and N outer
 * neighbors lights only one outer link (`floor(1/N)=0`, remainder to the first
 * path). Outer fan-out may therefore under-draw structure under unit edge
 * weights; accepted product default for conserving File incident mass.
 *
 * dist-1 categories stay `Imports` / `Exports`; outer rings `Import hop k` /
 * `Export hop k` (k≥2). Folder collapse (importerGroupKey) only at depth=1.
 *
 * **Export distances use longest simple path** so focus→format→types expands
 * even when types is also a direct import of focus (shortest BFS would pin
 * types at dist 1 and hide the chain). Imports still use shortest reverse BFS.
 *
 * **Layer-consistent import topology:** d3-sankey columns = longest path from
 * sources. Dist-1 files with no outer importers would share a column with hop-2
 * sources (duplicate “Imports” headers). Shared zero-width import rails pad
 * short reverse paths so every BFS dist sits on one column (multiHop-style).
 * Export side pads short File→deep-file paths with out-rails when a direct
 * dep’s longest-path dist is &gt; 1.
 *
 * Imports (left) teal; Exports (right) yellow. Carbon colors bands by source,
 * so File→Export strokes are recolored in the client polish step.
 */

import {
	fileDistances,
	fileImportAdj,
	fileImportedByAdj,
	fileLongestDistances,
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
 * How export-side package leaves are placed relative to hop columns.
 *
 * | Mode | Behavior |
 * | ---- | -------- |
 * | `pin-overdraw` | One package node at max importer hop; may exceed Depth |
 * | `pin-clip` | One package node at max hop, clipped to Depth |
 * | `per-hop` | Legacy: package at each importer hop (d+1) |
 */
export type PackageLeafMode = 'pin-overdraw' | 'pin-clip' | 'per-hop';

export const PACKAGE_LEAF_MODES: readonly PackageLeafMode[] = [
	'pin-overdraw',
	'pin-clip',
	'per-hop',
] as const;

export const DEFAULT_PACKAGE_LEAF_MODE: PackageLeafMode = 'pin-overdraw';

export function resolvePackageLeafMode(
	raw?: string | null,
): PackageLeafMode {
	if (raw === 'pin-clip' || raw === 'per-hop' || raw === 'pin-overdraw') {
		return raw;
	}
	return DEFAULT_PACKAGE_LEAF_MODE;
}

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

/** Shared invisible rail for File→deep export padding (stage = hop column index). */
export function exportRailId(stage: number): string {
	return `\u200b·out-rail·h${stage}`;
}

/**
 * Project a file as a dual-side hub: imports left, exports right.
 * Returns null when the file is missing or has no incident edges.
 *
 * @param opts.maxDepth Viz-only dual BFS radius (default {@link HUB_DEFAULT_MAX_DEPTH}).
 *   Scan is unbounded.
 * @param opts.packageLeafMode Package leaf placement (default {@link DEFAULT_PACKAGE_LEAF_MODE}).
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
		packageLeafMode?: PackageLeafMode;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 400;
	const maxImporters = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxDeps = opts?.maxDeps ?? DEFAULT_MAX_DEPS;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
	const hubRadius = Math.max(1, Math.floor(opts?.maxDepth ?? HUB_DEFAULT_MAX_DEPTH));
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const packageLeafMode = resolvePackageLeafMode(opts?.packageLeafMode);
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
				// Match export pin-far: plain labels unless legacy per-hop
				plainHopLabels: packageLeafMode !== 'per-hop',
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
			packageLeafMode,
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
	// Export hops may overdraw past hubRadius when packageLeafMode is pin-overdraw.
	let maxExportHop = hubRadius;
	for (const cat of present) {
		const m = /^Export hop (\d+)$/.exec(cat);
		if (m) maxExportHop = Math.max(maxExportHop, Number(m[1]));
	}
	const exportHops: string[] = [];
	for (let d = 2; d <= maxExportHop; d++) {
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
		ariaLabel: `Hub imports and exports for ${fileId} (viz depth ${hubRadius}, packages ${packageLeafMode})`,
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
		/** When true, skip · in hN suffixes (pin-far package modes). */
		plainHopLabels?: boolean;
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
		plainHopLabels = false,
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
			const preferred = hopOverflowDisplay(
				moreCountLabel(otherCount),
				'in',
				d,
				radiusL,
				plainHopLabels,
			);
			const otherName = claimName(
				usedNames,
				preferred,
				plainHopLabels ? 'more' : `in h${d}`,
			);
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
			const preferred = hopNodeDisplay(base, 'in', d, radiusL, plainHopLabels);
			const name = claimName(
				usedNames,
				preferred,
				plainHopLabels ? 'file' : `in h${d}`,
			);
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
 * Forward multi-hop: File → Exports → … → Export hop N.
 *
 * File columns use **longest simple path** so chains like focus→format→types
 * expand even when types is also a direct dep. Focus out-mass is conserved;
 * package leaves of intermediate files are structural (not File mass).
 */
function addExportRings(
	args: LinkBuilder & {
		fileId: string;
		outEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
		packageLeafMode: PackageLeafMode;
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
		packageLeafMode,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
		classicLabels,
	} = args;
	const plainHopLabels = packageLeafMode !== 'per-hop';

	const fwdAdj = fileImportAdj(graph);
	// Longest path: format→types stays at hop 2 when types is also a direct dep
	const { dist, maxHops } = fileLongestDistances(graph, fileId, fwdAdj);
	const radiusR = Math.min(hubRadius, Math.max(maxHops, 1));

	type NonFileDep = {
		preferredLabel: string;
		weight: number;
		ref: AlluvialNodeRef;
		color: string;
		key: string;
	};
	/** Focus-incident file deps (seed mass), keyed by path. */
	const fileSeed = new Map<string, number>();
	/** Focus-incident packages (always on Exports / dist-1). */
	const focusPackages = new Map<string, NonFileDep>();

	for (const e of outEdges) {
		const w = edgeWeight(e, graph, weightAxis);
		if (e.toKind === 'file') {
			fileSeed.set(e.to, (fileSeed.get(e.to) ?? 0) + w);
			continue;
		}
		const pkgLabel =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const key = `${e.toKind}:${e.to}`;
		const prev = focusPackages.get(key);
		if (prev) prev.weight += w;
		else {
			focusPackages.set(key, {
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

	// Include every seed file even if longest dist exceeds radius (cap to radiusR)
	const filesAt = new Map<number, string[]>();
	for (const [path, rawD] of dist) {
		if (rawD < 1) continue;
		const d = Math.min(rawD, radiusR);
		if (path === fileId) continue;
		const list = filesAt.get(d) ?? [];
		if (!list.includes(path)) list.push(path);
		filesAt.set(d, list);
	}
	// Seed-only files missing from dist (shouldn't happen) — force dist 1
	for (const path of fileSeed.keys()) {
		if (path === fileId) continue;
		if (![...filesAt.values()].some((list) => list.includes(path))) {
			const list = filesAt.get(1) ?? [];
			list.push(path);
			filesAt.set(1, list);
		}
	}

	const display = new Map<string, string>();
	const keptByDist = new Map<number, string[]>();
	const mass = new Map<string, number>();

	/** Rails through stage maxStage (inclusive) for layer-consistent pads. */
	const ensureExportRailsUpTo = (maxStage: number) => {
		const cap = Math.max(maxStage, radiusR);
		for (let s = 1; s <= maxStage; s++) {
			const id = exportRailId(s);
			if (nodeMeta.has(id)) continue;
			nodeMeta.set(id, {
				category: exportHopCategory(s),
				color: exportHopColor(s, cap),
			});
			nodeRef[id] = { kind: 'bucket', id };
		}
	};

	/**
	 * Path from a node at `fromDist` (0 = File) into a target at `toDist`
	 * so sankey layer matches hop labels (pad short paths with out-rails).
	 */
	const padBetween = (
		fromLab: string,
		fromDist: number,
		toLab: string,
		toDist: number,
		w: number,
	) => {
		if (w <= 0 || toDist <= fromDist) return;
		if (toDist === fromDist + 1) {
			addLink(fromLab, toLab, w);
			return;
		}
		ensureExportRailsUpTo(toDist - 1);
		let prev = fromLab;
		for (let stage = fromDist + 1; stage < toDist; stage++) {
			const rail = exportRailId(stage);
			addLink(prev, rail, w);
			prev = rail;
		}
		addLink(prev, toLab, w);
	};

	/** File → (rails) → target so longest-path dist matches sankey layer. */
	const padFromFile = (targetLab: string, d: number, w: number) => {
		padBetween(fileLabel, 0, targetLab, d, w);
	};

	// --- Place files hop by hop (longest-path dist) ---
	for (let d = 1; d <= radiusR; d++) {
		const files = filesAt.get(d) ?? [];
		const keptInner = new Set(keptByDist.get(d - 1) ?? []);
		const ranked = [...files].sort((a, b) => {
			const sa =
				d === 1
					? (fileSeed.get(a) ?? 0)
					: edgeWeightFromSet(graph, keptInner, a, weightAxis) ||
						(fileSeed.get(a) ?? 0);
			const sb =
				d === 1
					? (fileSeed.get(b) ?? 0)
					: edgeWeightFromSet(graph, keptInner, b, weightAxis) ||
						(fileSeed.get(b) ?? 0);
			return sb - sa || a.localeCompare(b);
		});
		const kept = ranked.slice(0, maxPerHop);
		const keptSet = new Set(kept);
		keptByDist.set(d, kept);
		const otherCount = ranked.length - kept.length;

		if (otherCount > 0) {
			const preferred = hopOverflowDisplay(
				moreCountLabel(otherCount),
				'out',
				d,
				radiusR,
				plainHopLabels,
			);
			const otherName = claimName(
				usedNames,
				preferred,
				plainHopLabels ? 'more' : `out h${d}`,
			);
			for (const f of files) {
				if (!keptSet.has(f)) display.set(f, otherName);
			}
			nodeRef[otherName] = { kind: 'bucket', id: `other-export-h${d}` };
			nodeMeta.set(otherName, {
				category: exportHopCategory(d),
				color: TEAL.exportOther,
			});
		}

		const pathLabels =
			d === 1 && classicLabels ? classicLabels : uniqueFileLabels(kept);
		for (const f of kept) {
			const base = pathLabels.get(f) ?? f;
			const preferred = hopNodeDisplay(base, 'out', d, radiusR, plainHopLabels);
			const name = claimName(
				usedNames,
				preferred,
				plainHopLabels ? 'file' : `out h${d}`,
			);
			display.set(f, name);
			nodeRef[name] = { kind: 'file', id: f };
			nodeMeta.set(name, {
				category: exportHopCategory(d),
				color: exportHopColor(d, radiusR),
			});
		}
	}

	// --- Seed focus out-mass onto file deps (pad when longest dist > 1) ---
	for (const [f, w] of fileSeed) {
		if (w <= 0) continue;
		const lab = display.get(f);
		if (!lab) {
			// Overflowed: dump mass into hop bucket if any, else skip structure
			continue;
		}
		if (nodeRef[lab]?.kind === 'bucket') {
			// Folded into overflow — still count File mass into that bucket
			const d = Math.min(dist.get(f) ?? 1, radiusR);
			padFromFile(lab, d, w);
			continue;
		}
		const d = Math.min(dist.get(f) ?? 1, radiusR);
		padFromFile(lab, d, w);
		mass.set(f, (mass.get(f) ?? 0) + w);
	}

	// --- Package leaves + mass routing ---
	if (packageLeafMode === 'per-hop') {
		routeExportMassPerHop({
			graph,
			fileLabel,
			hubRadius,
			radiusR,
			maxPerHop,
			weightAxis,
			focusPackages,
			keptByDist,
			display,
			dist,
			fwdAdj,
			mass,
			usedNames,
			addLink,
			nodeRef,
			nodeMeta,
			padFromFile,
		});
	} else {
		routeExportMassPinFar({
			graph,
			fileLabel,
			hubRadius,
			radiusR,
			maxPerHop,
			weightAxis,
			overdraw: packageLeafMode === 'pin-overdraw',
			focusPackages,
			keptByDist,
			display,
			dist,
			fwdAdj,
			mass,
			usedNames,
			addLink,
			nodeRef,
			nodeMeta,
			padFromFile,
			padBetween,
			ensureExportRailsUpTo,
		});
	}
}

type NonFileDep = {
	preferredLabel: string;
	weight: number;
	ref: AlluvialNodeRef;
	color: string;
	key: string;
};

type PkgCand = {
	preferredLabel: string;
	ref: AlluvialNodeRef;
	color: string;
	rank: number;
};

/**
 * Legacy: focus packages on Exports; outer package leaves at each importer d+1
 * (one node per package id per hop). Never same-column as parent.
 */
function routeExportMassPerHop(args: {
	graph: CodeGraph;
	fileLabel: string;
	hubRadius: number;
	radiusR: number;
	maxPerHop: number;
	weightAxis: WeightAxis;
	focusPackages: Map<string, NonFileDep>;
	keptByDist: Map<number, string[]>;
	display: Map<string, string>;
	dist: Map<string, number>;
	fwdAdj: Map<string, string[]>;
	mass: Map<string, number>;
	usedNames: Set<string>;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
	padFromFile: (targetLab: string, d: number, w: number) => void;
}): void {
	const {
		graph,
		fileLabel,
		hubRadius,
		radiusR,
		maxPerHop,
		weightAxis,
		focusPackages,
		keptByDist,
		display,
		dist,
		fwdAdj,
		mass,
		usedNames,
		addLink,
		nodeRef,
		nodeMeta,
	} = args;

	const focusPkgList = [...focusPackages.values()].sort(
		(a, b) =>
			b.weight - a.weight || a.preferredLabel.localeCompare(b.preferredLabel),
	);
	const dist1FileCount = keptByDist.get(1)?.length ?? 0;
	const pkgBudget = Math.max(0, maxPerHop - dist1FileCount);
	const keptPkgs = focusPkgList.slice(0, pkgBudget);
	const overflowPkgs = focusPkgList.slice(pkgBudget);
	for (const entry of keptPkgs) {
		const name = claimName(usedNames, entry.preferredLabel, entry.ref.kind);
		addLink(fileLabel, name, entry.weight);
		nodeRef[name] = entry.ref;
		nodeMeta.set(name, {
			category: 'Exports',
			color: entry.color,
		});
	}
	if (overflowPkgs.length) {
		const otherName = claimName(
			usedNames,
			moreCountLabel(overflowPkgs.length),
			'export-pkgs',
		);
		for (const entry of overflowPkgs) {
			addLink(fileLabel, otherName, entry.weight);
		}
		nodeRef[otherName] = { kind: 'bucket', id: 'other-export-pkgs' };
		nodeMeta.set(otherName, {
			category: 'Exports',
			color: TEAL.exportOther,
		});
	}

	const packageNodeAt = new Map<string, string>(); // `${pkgDist}\0${ref.id}`
	const packageOverflowAt = new Map<number, string>();

	const ensureOuterPackageNode = (
		preferredLabel: string,
		ref: AlluvialNodeRef,
		color: string,
		pkgDist: number,
	): string => {
		const key = `${pkgDist}\0${ref.id}`;
		const existing = packageNodeAt.get(key);
		if (existing) return existing;
		const preferred = hopFileLabel(preferredLabel, 'out', pkgDist, hubRadius);
		const name = claimName(usedNames, preferred, ref.kind);
		packageNodeAt.set(key, name);
		nodeRef[name] = ref;
		nodeMeta.set(name, {
			category: exportHopCategory(pkgDist),
			color,
		});
		return name;
	};

	const ensureOuterPackageOverflow = (pkgDist: number, count: number): string => {
		const existing = packageOverflowAt.get(pkgDist);
		if (existing) return existing;
		const name = claimName(
			usedNames,
			hopOverflowLabel(moreCountLabel(count), 'out', pkgDist),
			`pkg-h${pkgDist}`,
		);
		packageOverflowAt.set(pkgDist, name);
		nodeRef[name] = {
			kind: 'bucket',
			id: `other-export-pkg-h${pkgDist}`,
		};
		nodeMeta.set(name, {
			category: exportHopCategory(pkgDist),
			color: TEAL.exportOther,
		});
		return name;
	};

	for (let d = 1; d <= radiusR; d++) {
		const parents = [...(keptByDist.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		const canPlacePackages = d + 1 <= hubRadius;
		const pkgDist = d + 1;

		for (const f of parents) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const fromLab = display.get(f);
			if (!fromLab || nodeRef[fromLab]?.kind === 'bucket') continue;

			type Child =
				| { kind: 'file'; path: string; lab: string }
				| {
						kind: 'package';
						preferredLabel: string;
						ref: AlluvialNodeRef;
						color: string;
				  };

			const children: Child[] = [];
			if (d < radiusR) {
				for (const c of fwdAdj.get(f) ?? []) {
					if ((dist.get(c) ?? 0) !== d + 1 || !display.has(c)) continue;
					children.push({ kind: 'file', path: c, lab: display.get(c)! });
				}
			}

			const pkgCands: PkgCand[] = [];
			let overflowPkg: PkgCand[] = [];
			if (canPlacePackages) {
				for (const e of graph.edges) {
					if (e.from !== f || e.toKind === 'file') continue;
					const pkgLabel =
						e.toKind === 'unresolved'
							? e.specifier
							: e.to.replace(/^unresolved:/, '');
					pkgCands.push({
						preferredLabel: pkgLabel,
						ref: {
							kind: e.toKind === 'unresolved' ? 'unresolved' : 'package',
							id: e.to,
						},
						color:
							e.toKind === 'unresolved' ? TEAL.exportOther : TEAL.exportPkg,
						rank: edgeWeight(e, graph, weightAxis),
					});
				}
				pkgCands.sort(
					(a, b) =>
						b.rank - a.rank ||
						a.preferredLabel.localeCompare(b.preferredLabel),
				);
				const fileChildCount = children.length;
				const budget = Math.max(0, maxPerHop - fileChildCount);
				for (const p of pkgCands.slice(0, budget)) {
					children.push({
						kind: 'package',
						preferredLabel: p.preferredLabel,
						ref: p.ref,
						color: p.color,
					});
				}
				overflowPkg = pkgCands.slice(budget);
			}

			if (!children.length && !overflowPkg.length) continue;

			type Target =
				| { kind: 'file'; lab: string; path: string }
				| {
						kind: 'package';
						preferredLabel: string;
						ref: AlluvialNodeRef;
						color: string;
				  }
				| { kind: 'overflow'; count: number };

			const targets: Target[] = [];
			for (const ch of children) {
				if (ch.kind === 'file') {
					targets.push({ kind: 'file', lab: ch.lab, path: ch.path });
				} else {
					targets.push({
						kind: 'package',
						preferredLabel: ch.preferredLabel,
						ref: ch.ref,
						color: ch.color,
					});
				}
			}
			if (overflowPkg.length) {
				targets.push({ kind: 'overflow', count: overflowPkg.length });
			}

			const base = Math.floor(m / targets.length);
			let rem = m - base * targets.length;
			for (const t of targets) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				if (t.kind === 'file') {
					addLink(fromLab, t.lab, share);
					mass.set(t.path, (mass.get(t.path) ?? 0) + share);
				} else if (t.kind === 'package') {
					const name = ensureOuterPackageNode(
						t.preferredLabel,
						t.ref,
						t.color,
						pkgDist,
					);
					addLink(fromLab, name, share);
				} else {
					const name = ensureOuterPackageOverflow(pkgDist, t.count);
					addLink(fromLab, name, share);
				}
			}
			mass.set(f, 0);
		}
	}
}

/**
 * Pin-far: one display node per package id at max importer hop.
 * `overdraw` allows pin past hubRadius; otherwise clip and drop rim-colliding leaves.
 */
function routeExportMassPinFar(args: {
	graph: CodeGraph;
	fileLabel: string;
	hubRadius: number;
	radiusR: number;
	maxPerHop: number;
	weightAxis: WeightAxis;
	overdraw: boolean;
	focusPackages: Map<string, NonFileDep>;
	keptByDist: Map<number, string[]>;
	display: Map<string, string>;
	dist: Map<string, number>;
	fwdAdj: Map<string, string[]>;
	mass: Map<string, number>;
	usedNames: Set<string>;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
	padFromFile: (targetLab: string, d: number, w: number) => void;
	padBetween: (
		fromLab: string,
		fromDist: number,
		toLab: string,
		toDist: number,
		w: number,
	) => void;
	ensureExportRailsUpTo: (maxStage: number) => void;
}): void {
	const {
		graph,
		fileLabel,
		hubRadius,
		radiusR,
		maxPerHop,
		weightAxis,
		overdraw,
		focusPackages,
		keptByDist,
		display,
		dist,
		fwdAdj,
		mass,
		usedNames,
		addLink,
		nodeRef,
		nodeMeta,
		padFromFile,
		padBetween,
		ensureExportRailsUpTo,
	} = args;

	type PinRec = {
		key: string;
		preferredLabel: string;
		ref: AlluvialNodeRef;
		color: string;
		/** Max natural hop (parentDist+1) before clip. */
		pinNatural: number;
		focusWeight: number;
		/** Rank mass: focus + edges from kept files in radius. */
		rank: number;
	};

	const recs = new Map<string, PinRec>();

	const touch = (
		key: string,
		preferredLabel: string,
		ref: AlluvialNodeRef,
		color: string,
		naturalHop: number,
		rankAdd: number,
		focusAdd: number,
	) => {
		const prev = recs.get(key);
		if (!prev) {
			recs.set(key, {
				key,
				preferredLabel,
				ref,
				color,
				pinNatural: naturalHop,
				focusWeight: focusAdd,
				rank: rankAdd,
			});
			return;
		}
		prev.pinNatural = Math.max(prev.pinNatural, naturalHop);
		prev.focusWeight += focusAdd;
		prev.rank += rankAdd;
	};

	for (const entry of focusPackages.values()) {
		touch(
			entry.key,
			entry.preferredLabel,
			entry.ref,
			entry.color,
			1,
			entry.weight,
			entry.weight,
		);
	}

	const keptFiles = new Set<string>();
	for (const list of keptByDist.values()) {
		for (const f of list) keptFiles.add(f);
	}

	for (const f of keptFiles) {
		const d = Math.min(dist.get(f) ?? 1, radiusR);
		for (const e of graph.edges) {
			if (e.from !== f || e.toKind === 'file') continue;
			const pkgLabel =
				e.toKind === 'unresolved'
					? e.specifier
					: e.to.replace(/^unresolved:/, '');
			const key = `${e.toKind}:${e.to}`;
			const w = edgeWeight(e, graph, weightAxis);
			touch(
				key,
				pkgLabel,
				{
					kind: e.toKind === 'unresolved' ? 'unresolved' : 'package',
					id: e.to,
				},
				e.toKind === 'unresolved' ? TEAL.exportOther : TEAL.exportPkg,
				d + 1,
				w,
				0,
			);
		}
	}

	const pinOf = (natural: number): number | null => {
		if (overdraw) return Math.max(1, natural);
		// Clip: never past Depth; drop if natural is only past rim and no
		// in-radius pin remains (handled per parent when linking).
		const clipped = Math.min(Math.max(1, natural), hubRadius);
		return clipped;
	};

	// Global budget by rank
	const ranked = [...recs.values()].sort(
		(a, b) =>
			b.rank - a.rank || a.preferredLabel.localeCompare(b.preferredLabel),
	);
	const keptKeys = new Set(ranked.slice(0, maxPerHop).map((r) => r.key));
	const overflowCount = ranked.length - keptKeys.size;

	// Materialize kept package nodes at pin dist
	const displayByKey = new Map<string, string>(); // package key → node name
	const pinByKey = new Map<string, number>();
	let maxPin = 1;

	for (const rec of ranked) {
		if (!keptKeys.has(rec.key)) continue;
		const pin = pinOf(rec.pinNatural);
		if (pin == null) continue;
		pinByKey.set(rec.key, pin);
		maxPin = Math.max(maxPin, pin);

		// Pin-far: one node per package id — plain name (no · out hN). Hop lives
		// in the column category only. claimName still disambiguates rare clashes.
		const name = claimName(usedNames, rec.preferredLabel, rec.ref.kind);
		displayByKey.set(rec.key, name);
		nodeRef[name] = rec.ref;
		nodeMeta.set(name, {
			category: exportHopCategory(pin),
			color: rec.color,
		});
	}

	if (overflowCount > 0) {
		// Overflow bucket at max pin among overflow candidates (clipped/overdrawn)
		let overflowPin = 1;
		for (const rec of ranked) {
			if (keptKeys.has(rec.key)) continue;
			const p = pinOf(rec.pinNatural);
			if (p != null) overflowPin = Math.max(overflowPin, p);
		}
		maxPin = Math.max(maxPin, overflowPin);
		const otherName = claimName(
			usedNames,
			moreCountLabel(overflowCount),
			'export-pkgs-pin',
		);
		nodeRef[otherName] = { kind: 'bucket', id: 'other-export-pkgs-pin' };
		nodeMeta.set(otherName, {
			category: exportHopCategory(overflowPin),
			color: TEAL.exportOther,
		});
		// Stash for focus overflow mass
		(displayByKey as Map<string, string>).set('__overflow__', otherName);
		pinByKey.set('__overflow__', overflowPin);
	}

	if (maxPin > 1) ensureExportRailsUpTo(maxPin - 1);

	// Focus package mass → pin nodes (pad short paths)
	for (const entry of focusPackages.values()) {
		if (keptKeys.has(entry.key)) {
			const name = displayByKey.get(entry.key);
			const pin = pinByKey.get(entry.key);
			if (!name || pin == null) continue;
			padFromFile(name, pin, entry.weight);
			continue;
		}
		// Overflow
		const name = displayByKey.get('__overflow__');
		const pin = pinByKey.get('__overflow__');
		if (!name || pin == null) continue;
		padFromFile(name, pin, entry.weight);
	}

	// Route file mass: consecutive file children + pin-far packages
	for (let d = 1; d <= radiusR; d++) {
		const parents = [...(keptByDist.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of parents) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const fromLab = display.get(f);
			if (!fromLab || nodeRef[fromLab]?.kind === 'bucket') continue;

			type Target =
				| { kind: 'file'; lab: string; path: string }
				| { kind: 'package'; key: string; lab: string; pin: number }
				| { kind: 'overflow'; lab: string; pin: number };

			const targets: Target[] = [];
			if (d < radiusR) {
				for (const c of fwdAdj.get(f) ?? []) {
					if ((dist.get(c) ?? 0) !== d + 1 || !display.has(c)) continue;
					targets.push({ kind: 'file', lab: display.get(c)!, path: c });
				}
			}

			const pkgCands: { key: string; rank: number }[] = [];
			for (const e of graph.edges) {
				if (e.from !== f || e.toKind === 'file') continue;
				const key = `${e.toKind}:${e.to}`;
				if (!keptKeys.has(key)) {
					if (displayByKey.has('__overflow__')) {
						// count toward overflow once
						const pin = pinByKey.get(key) ?? pinByKey.get('__overflow__');
						// use overflow only if this package was overflowed
						if (!keptKeys.has(key) && pinByKey.has('__overflow__')) {
							// collect overflow rank separately below
						}
					}
					continue;
				}
				const pin = pinByKey.get(key);
				const lab = displayByKey.get(key);
				if (pin == null || !lab) continue;
				// Parent must sit strictly left of pin (layer-safe)
				if (d >= pin) continue;
				pkgCands.push({
					key,
					rank: edgeWeight(e, graph, weightAxis),
				});
			}
			pkgCands.sort(
				(a, b) =>
					b.rank - a.rank || a.key.localeCompare(b.key),
			);
			const fileChildCount = targets.length;
			const budget = Math.max(0, maxPerHop - fileChildCount);
			const keptLocal = pkgCands.slice(0, budget);
			const overflowLocal = pkgCands.slice(budget);

			for (const p of keptLocal) {
				const lab = displayByKey.get(p.key)!;
				const pin = pinByKey.get(p.key)!;
				targets.push({ kind: 'package', key: p.key, lab, pin });
			}

			// Parent-local overflow of kept-key packages + packages not in global kept
			let overflowPkgEdges = 0;
			for (const e of graph.edges) {
				if (e.from !== f || e.toKind === 'file') continue;
				const key = `${e.toKind}:${e.to}`;
				if (keptKeys.has(key)) continue;
				overflowPkgEdges += 1;
			}
			overflowPkgEdges += overflowLocal.length;

			if (overflowPkgEdges > 0 && displayByKey.has('__overflow__')) {
				const lab = displayByKey.get('__overflow__')!;
				const pin = pinByKey.get('__overflow__')!;
				if (d < pin) {
					targets.push({ kind: 'overflow', lab, pin });
				}
			}

			if (!targets.length) continue;

			const base = Math.floor(m / targets.length);
			let rem = m - base * targets.length;
			for (const t of targets) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				if (t.kind === 'file') {
					addLink(fromLab, t.lab, share);
					mass.set(t.path, (mass.get(t.path) ?? 0) + share);
				} else {
					padBetween(fromLab, d, t.lab, t.pin, share);
				}
			}
			mass.set(f, 0);
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

/**
 * Pin-far modes: plain path labels (hop is column category only).
 * Per-hop: keep · in/out hN for cross-column identity.
 */
function hopNodeDisplay(
	base: string,
	side: 'in' | 'out',
	dist: number,
	radius: number,
	plain: boolean,
): string {
	return plain ? base : hopFileLabel(base, side, dist, radius);
}

function hopOverflowDisplay(
	base: string,
	side: 'in' | 'out',
	dist: number,
	radius: number,
	plain: boolean,
): string {
	if (plain || radius <= 1) return base;
	return hopOverflowLabel(base, side, dist);
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
