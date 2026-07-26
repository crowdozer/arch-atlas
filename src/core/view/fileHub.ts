/**
 * Dual-side file hub alluvial — high-edge / barrel projection.
 *
 * Columns (L→R), category names fixed:
 *
 *   Import hop N … → Imports → File → Exports → Export hop N
 *
 * **Hard product law** (membership of each side; cascades pure):
 *
 * - **Imports / Import hop k:** only what the focus **imports** (outbound).
 *   Forward longest-path **file** deps + packages/unresolved along that tree
 *   (focus packages: package → File; intermediate packages: package → parent
 *   file). Never reverse consumers.
 * - **Exports / Export hop k:** only what **imports from** the focus (inbound
 *   reverse BFS consumers). Never outbound deps of the focus.
 * - Rules apply at every hop: import cascade does not absorb export candidates
 *   and vice versa.
 *
 * **Edge orientation** remains A → B means A imports B. Carbon columns are
 * driven by **category** (not pure path-from-source), so Import-side file deps
 * may sit left of File with File → dep links, and Export-side consumers sit
 * right of File with consumer → File links.
 *
 * **Depth (viz-only)** dual hop radius. Asymmetric sides omit empty columns.
 *
 * **Mass (chart File node):**
 * - Into File: reverse importer edges + focus package/unresolved (package→File)
 * - Out of File: focus → **file** deps only
 *
 * **{@link PackageLeafMode}** placement no-op for export packages; still
 * controls plain hop labels (`per-hop` vs plain).
 *
 * Integer multi-parent split conserves File incident mass (accepted default).
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
 * Dupes / hop-label control. Under file-pure export cascade, pin modes do **not**
 * place package leaves on Exports (that path was removed). Modes only affect
 * whether multi-hop file labels get · in/out hN suffixes (`per-hop` = suffixed).
 *
 * | Mode | Behavior (labels only) |
 * | ---- | ---------------------- |
 * | `pin-overdraw` | Plain hop file labels (default) |
 * | `pin-clip` | Plain hop file labels |
 * | `per-hop` | Legacy · in/out hN suffixes on multi-hop files |
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
 * @param opts.packageLeafMode Hop label style only under file-pure cascade
 *   (default {@link DEFAULT_PACKAGE_LEAF_MODE}).
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
	/** Reverse-hop display names that received free-source pad rails. */
	const terminators: string[] = [];

	// --- Exports side: reverse BFS (who imports the focus) ---
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
			const exportTerminators = addImportRings({
				graph,
				fileId,
				fileLabel,
				inEdges,
				hubRadius,
				maxPerHop: Math.min(48, maxImporters),
				weightAxis,
				// Plain labels unless legacy per-hop suffix mode
				plainHopLabels: packageLeafMode !== 'per-hop',
				addLink,
				nodeRef,
				nodeMeta,
				usedNames,
				classicLabels,
			});
			// Reverse free-sources land on Exports categories (hard law)
			terminators.push(...exportTerminators);
		}
	}

	// --- Imports side: focus package / unresolved (package → File) ---
	const focusPkgEdges = outEdges.filter(
		(e) => e.toKind === 'package' || e.toKind === 'unresolved',
	);
	if (focusPkgEdges.length) {
		addFocusPackageImports({
			graph,
			fileLabel,
			outEdges: focusPkgEdges,
			maxPerHop: Math.min(48, maxDeps),
			weightAxis,
			addLink,
			nodeRef,
			nodeMeta,
			usedNames,
		});
	}

	// --- Imports side: forward longest-path file deps (what focus imports) ---
	const fileOutEdges = outEdges.filter((e) => e.toKind === 'file');
	let importFileDisplay = new Map<string, string>();
	if (fileOutEdges.length) {
		importFileDisplay = addExportRings({
			graph,
			fileId,
			fileLabel,
			outEdges: fileOutEdges,
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

	// --- Imports side: packages of kept import-tree files (package → that file) ---
	if (importFileDisplay.size) {
		addExportTreePackageImports({
			graph,
			fileLabel,
			exportFileDisplay: importFileDisplay,
			maxPerHop: Math.min(48, maxDeps),
			weightAxis,
			addLink,
			nodeRef,
			nodeMeta,
			usedNames,
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

	// Remap internal tags → display names (Importers left, Imports/deps right).
	for (const [name, meta] of nodeMeta) {
		nodeMeta.set(name, {
			...meta,
			category: displayHubCategory(meta.category),
		});
	}

	const present = new Set([...nodeMeta.values()].map((m) => m.category));
	// Left: outer Import hop N … → Imports
	const importHops: string[] = [];
	for (let d = hubRadius; d >= 2; d--) {
		const cat = importHopCategory(d);
		if (present.has(cat)) importHops.push(cat);
	}
	// Right: Exports → … → outer Export hop (may overdraw past hubRadius)
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
		terminators: terminators.length ? terminators : undefined,
	});
}

/**
 * Normalize legacy display tags. Build already uses Imports/Import hop (left)
 * and Exports/Export hop (right).
 */
export function displayHubCategory(category: string): string {
	if (category === 'Exporters') return 'Exports';
	if (category === 'Importers') return 'Imports';
	if (category.startsWith('Importer hop ')) {
		return category.replace(/^Importer hop /, 'Import hop ');
	}
	return category;
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

/** Cyan hop gradient (Imports / left) — closer to File is brighter. */
function importHopColor(dist: number, maxDist: number): string {
	const t = dist / Math.max(maxDist, 1);
	if (t > 0.75) return '#0e7490'; // cyan-700
	if (t > 0.5) return '#0891b2'; // cyan-600
	if (t > 0.25) return '#06b6d4'; // cyan-500
	return '#22d3ee'; // cyan-400
}

/** Yellow hop gradient (Exports / right) — closer to File is brighter. */
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
 * Place focus-incident package/unresolved imports on the **Imports** side.
 * Display links are package → File (so sankey sits left of File); graph edges
 * remain file → package. Coexists with reverse-importer rings in the same
 * Imports category family. Import-side teal/package colors (not export yellow).
 */
function addFocusPackageImports(
	args: LinkBuilder & {
		outEdges: ImportEdge[];
		maxPerHop: number;
	},
): void {
	const {
		graph,
		fileLabel,
		outEdges,
		maxPerHop,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
	} = args;

	type PkgEntry = {
		preferredLabel: string;
		weight: number;
		ref: AlluvialNodeRef;
		color: string;
		key: string;
	};
	const byKey = new Map<string, PkgEntry>();
	for (const e of outEdges) {
		if (e.toKind !== 'package' && e.toKind !== 'unresolved') continue;
		const w = edgeWeight(e, graph, weightAxis);
		const pkgLabel =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const key = `${e.toKind}:${e.to}`;
		const prev = byKey.get(key);
		if (prev) prev.weight += w;
		else {
			byKey.set(key, {
				key,
				preferredLabel: pkgLabel,
				weight: w,
				ref: {
					kind: e.toKind === 'unresolved' ? 'unresolved' : 'package',
					id: e.to,
				},
				color:
					e.toKind === 'unresolved' ? TEAL.unresolved : TEAL.package,
			});
		}
	}

	const ranked = [...byKey.values()].sort(
		(a, b) =>
			b.weight - a.weight || a.preferredLabel.localeCompare(b.preferredLabel),
	);
	const kept = ranked.slice(0, maxPerHop);
	const overflow = ranked.slice(maxPerHop);

	for (const entry of kept) {
		const name = claimName(usedNames, entry.preferredLabel, entry.ref.kind);
		// package → File (import-side orientation for sankey layer)
		addLink(name, fileLabel, entry.weight);
		nodeRef[name] = entry.ref;
		nodeMeta.set(name, {
			category: 'Imports',
			color: entry.color,
		});
	}
	if (overflow.length) {
		const otherName = claimName(
			usedNames,
			moreCountLabel(overflow.length),
			'import-pkgs',
		);
		for (const entry of overflow) {
			addLink(otherName, fileLabel, entry.weight);
		}
		nodeRef[otherName] = { kind: 'bucket', id: 'other-import-pkgs' };
		nodeMeta.set(otherName, {
			category: 'Imports',
			color: TEAL.other,
		});
	}
}

/**
 * Packages imported by kept **export-tree** files appear on **Imports**
 * (display: package → importingFile). Never on Export hops.
 *
 * One display node per package id (reuses focus package node when the same
 * package is already on Imports). Structural mass only — does not change File
 * in/out mass (links target intermediate export-tree files, not File).
 */
function addExportTreePackageImports(
	args: LinkBuilder & {
		/** path → display name for kept non-bucket export-tree files */
		exportFileDisplay: Map<string, string>;
		maxPerHop: number;
	},
): void {
	const {
		graph,
		exportFileDisplay,
		maxPerHop,
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
	} = args;

	type PkgRec = {
		key: string;
		preferredLabel: string;
		ref: AlluvialNodeRef;
		color: string;
		rank: number;
		/** parent file path → weight */
		parents: Map<string, number>;
	};
	const recs = new Map<string, PkgRec>();

	for (const fPath of exportFileDisplay.keys()) {
		const fLab = exportFileDisplay.get(fPath)!;
		if (nodeRef[fLab]?.kind === 'bucket') continue;
		for (const e of graph.edges) {
			if (e.from !== fPath) continue;
			if (e.toKind !== 'package' && e.toKind !== 'unresolved') continue;
			const w = edgeWeight(e, graph, weightAxis);
			if (w <= 0) continue;
			const pkgLabel =
				e.toKind === 'unresolved'
					? e.specifier
					: e.to.replace(/^unresolved:/, '');
			const key = `${e.toKind}:${e.to}`;
			const prev = recs.get(key);
			if (prev) {
				prev.rank += w;
				prev.parents.set(fPath, (prev.parents.get(fPath) ?? 0) + w);
			} else {
				recs.set(key, {
					key,
					preferredLabel: pkgLabel,
					ref: {
						kind: e.toKind === 'unresolved' ? 'unresolved' : 'package',
						id: e.to,
					},
					color:
						e.toKind === 'unresolved' ? TEAL.unresolved : TEAL.package,
					rank: w,
					parents: new Map([[fPath, w]]),
				});
			}
		}
	}
	if (!recs.size) return;

	const findExistingImportPkg = (
		kind: AlluvialNodeRef['kind'],
		id: string,
	): string | undefined => {
		for (const [name, ref] of Object.entries(nodeRef)) {
			if (ref.kind !== kind || ref.id !== id) continue;
			if (nodeMeta.get(name)?.category === 'Imports') return name;
		}
		return undefined;
	};

	// Packages already on Imports (focus) always get tree→file links; new ones
	// compete for maxPerHop budget by rank.
	const already: PkgRec[] = [];
	const fresh: PkgRec[] = [];
	for (const rec of recs.values()) {
		if (findExistingImportPkg(rec.ref.kind, rec.ref.id)) already.push(rec);
		else fresh.push(rec);
	}
	fresh.sort(
		(a, b) =>
			b.rank - a.rank || a.preferredLabel.localeCompare(b.preferredLabel),
	);
	const keptFresh = fresh.slice(0, maxPerHop);
	const overflowFresh = fresh.slice(maxPerHop);

	const ensurePkgNode = (rec: PkgRec): string => {
		const existing = findExistingImportPkg(rec.ref.kind, rec.ref.id);
		if (existing) return existing;
		const name = claimName(usedNames, rec.preferredLabel, rec.ref.kind);
		nodeRef[name] = rec.ref;
		nodeMeta.set(name, {
			category: 'Imports',
			color: rec.color,
		});
		return name;
	};

	const linkParents = (pkgName: string, parents: Map<string, number>) => {
		for (const [fPath, w] of parents) {
			const fLab = exportFileDisplay.get(fPath);
			if (!fLab || nodeRef[fLab]?.kind === 'bucket') continue;
			addLink(pkgName, fLab, w);
		}
	};

	for (const rec of already) {
		linkParents(ensurePkgNode(rec), rec.parents);
	}
	for (const rec of keptFresh) {
		linkParents(ensurePkgNode(rec), rec.parents);
	}
	if (overflowFresh.length) {
		const otherName = claimName(
			usedNames,
			moreCountLabel(overflowFresh.length),
			'import-tree-pkgs',
		);
		nodeRef[otherName] = { kind: 'bucket', id: 'other-import-tree-pkgs' };
		nodeMeta.set(otherName, {
			category: 'Imports',
			color: TEAL.other,
		});
		for (const rec of overflowFresh) {
			linkParents(otherName, rec.parents);
		}
	}
}

/**
 * Reverse multi-hop: outer importers → … → Imports (dist-1) → File.
 * Mass = focus-incident reverse edges, routed outward for structure.
 * Outer hops ranked by connectivity into the kept inner ring.
 *
 * Returns display names of reverse-hop files that were **padded** (no outer
 * reverse parent) — hub terminators for polish chrome.
 */
function addImportRings(
	args: LinkBuilder & {
		fileId: string;
		inEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
		/** When true, skip · in hN suffixes (pin modes use plain labels). */
		plainHopLabels?: boolean;
		classicLabels?: Map<string, string>;
	},
): string[] {
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
	if (radiusL < 1) return [];

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
				category: exportHopCategory(d),
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
				category: exportHopCategory(d),
				color: exportHopColor(d, radiusL),
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
	const terminators: string[] = [];
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

		const terminatorSet = new Set<string>();
		for (let d = 1; d <= radiusL; d++) {
			for (const f of filesAt.get(d) ?? []) {
				const m = mass.get(f) ?? 0;
				if (m <= 0) continue;
				const lab = display.get(f);
				if (!lab) continue;
				if (receivesOuter.has(lab)) continue;
				// Free-source: pad short paths to radius (no-op when d >= radiusL).
				if (d < radiusL) {
					padImportRailsInto(addLink, lab, d, radiusL, m);
					// Only real file leaves (not rails / overflow buckets).
					if (
						nodeRef[lab]?.kind === 'file' &&
						!lab.includes('·in-rail') &&
						!lab.includes('·out-rail')
					) {
						terminatorSet.add(lab);
					}
				}
			}
		}
		terminators.push(...terminatorSet);
	}
	return terminators;
}

/** Register shared import rails (hidden labels) for stages 2..radius. */
function ensureImportRails(
	nodeMeta: Map<string, { category: string; color: string }>,
	nodeRef: Record<string, AlluvialNodeRef>,
	radiusL: number,
): void {
	for (let s = 2; s <= radiusL; s++) {
		const id = exportRailId(s);
		if (nodeMeta.has(id)) continue;
		nodeMeta.set(id, {
			category: exportHopCategory(s),
			color: exportHopColor(s, radiusL),
		});
		nodeRef[id] = { kind: 'bucket', id };
	}
}

/**
 * Path rails (export side) radiusL → … → (dist+1) → target so longest-path layer matches BFS dist.
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
		const rail = exportRailId(stage);
		if (prev) addLink(prev, rail, mass);
		prev = rail;
	}
	if (prev) addLink(prev, targetLab, mass);
}

/**
 * Forward multi-hop: File → Exports → … → Export hop N (**file→file only**).
 *
 * Callers pass **file-only** outEdges (focus packages go through
 * {@link addFocusPackageImports}). File columns use **longest simple path**
 * so chains like focus→format→types expand even when types is also a direct
 * dep. Focus file out-mass is conserved along file children; package outs of
 * export-tree files are never materialised on export hops — see
 * {@link addExportTreePackageImports} (Imports side).
 *
 * @returns path → display name for kept non-bucket export-tree files
 */
function addExportRings(
	args: LinkBuilder & {
		fileId: string;
		/** File→file out-edges only (packages handled on Imports). */
		outEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
		packageLeafMode: PackageLeafMode;
		classicLabels?: Map<string, string>;
	},
): Map<string, string> {
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

	/** Focus-incident file deps (seed mass), keyed by path. */
	const fileSeed = new Map<string, number>();
	for (const e of outEdges) {
		if (e.toKind !== 'file') continue;
		const w = edgeWeight(e, graph, weightAxis);
		fileSeed.set(e.to, (fileSeed.get(e.to) ?? 0) + w);
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
			const id = importRailId(s);
			if (nodeMeta.has(id)) continue;
			nodeMeta.set(id, {
				category: importHopCategory(s),
				color: importHopColor(s, cap),
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
			const rail = importRailId(stage);
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
				category: importHopCategory(d),
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
				category: importHopCategory(d),
				color: importHopColor(d, radiusR),
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

	// --- Route outward mass file→file only (no package leaves) ---
	for (let d = 1; d <= radiusR; d++) {
		const parents = [...(keptByDist.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of parents) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const fromLab = display.get(f);
			if (!fromLab || nodeRef[fromLab]?.kind === 'bucket') continue;

			const targets: { lab: string; path: string }[] = [];
			if (d < radiusR) {
				for (const c of fwdAdj.get(f) ?? []) {
					if ((dist.get(c) ?? 0) !== d + 1 || !display.has(c)) continue;
					targets.push({ lab: display.get(c)!, path: c });
				}
			}
			// Leaf files (no kept file children, or only package outs) keep mass
			if (!targets.length) continue;

			const base = Math.floor(m / targets.length);
			let rem = m - base * targets.length;
			for (const t of targets) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				addLink(fromLab, t.lab, share);
				mass.set(t.path, (mass.get(t.path) ?? 0) + share);
			}
			mass.set(f, 0);
		}
	}

	// Kept non-bucket export-tree files (for Imports-side package placement)
	const keptDisplay = new Map<string, string>();
	for (const [, paths] of keptByDist) {
		for (const f of paths) {
			const lab = display.get(f);
			if (!lab || nodeRef[lab]?.kind === 'bucket') continue;
			keptDisplay.set(f, lab);
		}
	}
	return keptDisplay;
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
			nodeMeta.set(source, { category: 'Exports', color: '#06b6d4' });
		} else if (otherLabel) {
			addLink(otherLabel, fileLabel, n);
		}
	}
	if (otherLabel) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-import-modules' };
		nodeMeta.set(otherLabel, { category: 'Exports', color: '#0e7490' });
	}
}
