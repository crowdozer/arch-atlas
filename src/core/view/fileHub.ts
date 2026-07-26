/**
 * Dual-side file hub alluvial — high-edge / barrel projection.
 *
 * **Behavioral matrix (authoritative):**
 * `.grok/reference/hub-alluvial-behavior.md`
 * Adjustments must stay **surgical** — do not retcon that matrix (or goldens)
 * to match cascade side effects on other columns.
 *
 * Columns (L→R), category names fixed:
 *
 *   Export hop N … → Exports → File → Imports → Import hop N → External
 *
 * Visual: **consumers left**, **deps right**, **external packages far right**
 * (one hop past the deepest file import hop).
 *
 * **Hard product law** (membership of each side; cascades pure):
 *
 * - **Exports / Export hop k (left of File):** only what **imports from** the
 *   focus (inbound reverse BFS). Never outbound deps.
 * - **Imports / Import hop k (right of File):** outbound **file** deps only.
 *   Never reverse consumers; never package leaves.
 * - **External:** pure package/unresolved leaves (node_modules / unresolved).
 *   Display links are **parent → [in-rails] → package** (sinks). Never free
 *   sources — Carbon headers = last category at each d3-sankey depth; free-source
 *   packages would share the leftmost layer with free-source export consumers.
 *   When file Imports exist, pad packages one hop past max file import dist so
 *   File→seed and File→package are not co-located (logger under External header).
 *
 * **Edge orientation** remains A → B means A imports B.
 *
 * **Import-tree placement (multi-instance dual-path):**
 * Focus-incident file deps (seeds) always get an instance on **Imports** (dist 1)
 * with File → seed. Edge expansion creates additional instances at hop d+1 so
 * analytics → redis/logger branches even when redis/logger are also seeds.
 * One node per (path, dist); packages still collapse by package id on External.
 *
 * **Mass (chart File node):**
 * - Into File: reverse importer edges only
 * - Out of File: focus → file deps + focus package/unresolved
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

/**
 * Outer import-side column for pure external package/unresolved leaves
 * (node_modules / unresolved). One rail depth beyond file Import hops.
 */
export const EXTERNAL_IMPORT_CATEGORY = 'External';

/** dist-1 keeps Imports/Exports; outer rings are Import hop k / Export hop k. */
export function importHopCategory(dist: number): string {
	return dist <= 1 ? 'Imports' : `Import hop ${dist}`;
}

export function exportHopCategory(dist: number): string {
	return dist <= 1 ? 'Exports' : `Export hop ${dist}`;
}

/** True for Imports, Import hop N, or External package rail. */
export function isImportSideCategory(category: string): boolean {
	return (
		category === 'Imports' ||
		category === EXTERNAL_IMPORT_CATEGORY ||
		category.startsWith('Import hop')
	);
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

	// --- Imports side: forward longest-path file deps (what focus imports) ---
	const fileOutEdges = outEdges.filter((e) => e.toKind === 'file');
	const focusPkgEdges = outEdges.filter(
		(e) => e.toKind === 'package' || e.toKind === 'unresolved',
	);
	const importTreeResult = addExportRings({
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

	// External package sinks must land **one topology hop** past the deepest
	// file import hop. Carbon/d3-sankey columns = path depth; direct File→pkg
	// co-locates with File→seed (logger) and last-category-wins paints External
	// over Imports. Pad with in-rails when maxFileDist ≥ 1 (still sinks).
	const maxFileDist = importTreeResult.maxFileDist;
	const externalDist = maxFileDist >= 1 ? maxFileDist + 1 : 1;

	// --- External: focus packages as sinks (File → [rails] → package) ---
	if (focusPkgEdges.length) {
		addFocusPackageImports({
			graph,
			fileLabel,
			outEdges: focusPkgEdges,
			maxPerHop: Math.min(48, maxDeps),
			weightAxis,
			externalDist,
			padFromFile: importTreeResult.padFromFile,
			addLink,
			nodeRef,
			nodeMeta,
			usedNames,
		});
	}

	// --- External: packages of import-tree files as parent → [rails] → package ---
	if (importTreeResult.tree.size) {
		addExportTreePackageImports({
			graph,
			importTree: importTreeResult.tree,
			/** Hub mass still at each parent after file→file routing (Kirchhoff). */
			residualMass: importTreeResult.residualMass,
			maxPerHop: Math.min(48, maxDeps),
			weightAxis,
			externalDist,
			padBetween: importTreeResult.padBetween,
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
	// Drop unused multi-instance labels from nodeRef (drill map must match nodes)
	for (const name of Object.keys(nodeRef)) {
		if (!used.has(name) && name !== fileLabel) delete nodeRef[name];
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
	// L→R: Export hop N … → Exports → File → Imports → Import hop N → External
	let maxImportHop = hubRadius;
	let maxExportHop = hubRadius;
	for (const cat of present) {
		const mi = /^Import hop (\d+)$/.exec(cat);
		if (mi) maxImportHop = Math.max(maxImportHop, Number(mi[1]));
		const me = /^Export hop (\d+)$/.exec(cat);
		if (me) maxExportHop = Math.max(maxExportHop, Number(me[1]));
	}
	// Consumers left of File: deeper reverse hops further left
	const exportHopsLeft: string[] = [];
	for (let d = maxExportHop; d >= 2; d--) {
		const cat = exportHopCategory(d);
		if (present.has(cat)) exportHopsLeft.push(cat);
	}
	// Deps right of File: deeper import hops further right, then External
	const importHopsRight: string[] = [];
	for (let d = 2; d <= maxImportHop; d++) {
		const cat = importHopCategory(d);
		if (present.has(cat)) importHopsRight.push(cat);
	}
	const categoryOrder = [
		...exportHopsLeft,
		...(present.has('Exports') ? ['Exports'] : []),
		'File',
		...(present.has('Imports') ? ['Imports'] : []),
		...importHopsRight,
		...(present.has(EXTERNAL_IMPORT_CATEGORY)
			? [EXTERNAL_IMPORT_CATEGORY]
			: []),
	].filter((c) => present.has(c) || c === 'File');

	// Forward true leaves (Imports*/External) for yellow contrast chrome
	const exportTerminators = collectForwardTerminators(links, nodeRef, nodeMeta);

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
		exportTerminators: exportTerminators.length
			? exportTerminators
			: undefined,
	});
}

/**
 * Forward true leaves on Imports / Import hop / External: non-rail, non-bucket
 * nodes with no out-edge to another non-rail node (packages + rim files).
 * Polish applies **yellow** wrap (contrast on cyan import columns).
 */
function collectForwardTerminators(
	links: { source: string; target: string; value: number }[],
	nodeRef: Record<string, AlluvialNodeRef>,
	nodeMeta: Map<string, { category: string; color: string }>,
): string[] {
	const isForwardCat = (cat: string | undefined): boolean =>
		cat === 'Imports' ||
		cat === EXTERNAL_IMPORT_CATEGORY ||
		(cat?.startsWith('Import hop') ?? false);

	const forwardNames: string[] = [];
	for (const [name, meta] of nodeMeta) {
		if (!isForwardCat(meta.category)) continue;
		if (name.includes('·in-rail') || name.includes('·out-rail')) continue;
		const ref = nodeRef[name];
		if (!ref || ref.kind === 'bucket') continue;
		forwardNames.push(name);
	}
	const forwardSet = new Set(forwardNames);

	const continues = new Set<string>();
	for (const l of links) {
		if (!forwardSet.has(l.source)) continue;
		if (l.target.includes('·in-rail') || l.target.includes('·out-rail')) continue;
		// Any non-rail out-edge means the chain continues (file→file or file→pkg)
		continues.add(l.source);
	}

	return forwardNames.filter((n) => !continues.has(n));
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
 * Focus-incident package/unresolved → **External** sinks.
 * Links are File → package when externalDist === 1, else File → in-rails →
 * package so Carbon places packages one hop past deepest file Imports.
 * Rails stay sinks (packages never free sources). Paint law keeps File↔rail
 * and rail→package bands visible; only pure rail↔rail is undrawn.
 */
function addFocusPackageImports(
	args: LinkBuilder & {
		outEdges: ImportEdge[];
		maxPerHop: number;
		/** Hub dist for package nodes (File = 0). */
		externalDist: number;
		padFromFile: (targetLab: string, toDist: number, w: number) => void;
	},
): void {
	const {
		graph,
		outEdges,
		maxPerHop,
		weightAxis,
		externalDist,
		padFromFile,
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
		nodeRef[name] = entry.ref;
		nodeMeta.set(name, {
			category: EXTERNAL_IMPORT_CATEGORY,
			color: entry.color,
		});
		// Topology hop for Carbon: pad when file Imports also leave File
		padFromFile(name, externalDist, entry.weight);
	}
	if (overflow.length) {
		const otherName = claimName(
			usedNames,
			moreCountLabel(overflow.length),
			'external-pkgs',
		);
		nodeRef[otherName] = { kind: 'bucket', id: 'other-external-pkgs' };
		nodeMeta.set(otherName, {
			category: EXTERNAL_IMPORT_CATEGORY,
			color: TEAL.other,
		});
		for (const entry of overflow) {
			padFromFile(otherName, externalDist, entry.weight);
		}
	}
}

/**
 * Packages of kept import-tree files → **External** sinks
 * (**parent → [rails] → package**). Never free sources; never Export*.
 *
 * Band widths use **residual hub mass** at each parent after file→file routing
 * (proportional to raw edge weights). Using raw importer-loc of the parent as
 * package mass invented flow at leaves (types/user→zod thicker than
 * users→types/user) so the pair looked like a floating island near File.
 */
function addExportTreePackageImports(
	args: LinkBuilder & {
		/** path → { label, dist } for kept non-bucket import-tree files */
		importTree: Map<string, { lab: string; dist: number }>;
		/** path → hub mass left after file→file routing */
		residualMass: Map<string, number>;
		maxPerHop: number;
		/** Hub dist for package nodes (File = 0). */
		externalDist: number;
		padBetween: (
			fromLab: string,
			fromDist: number,
			toLab: string,
			toDist: number,
			w: number,
		) => void;
	},
): void {
	const {
		graph,
		importTree,
		residualMass,
		maxPerHop,
		weightAxis,
		externalDist,
		padBetween,
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
		/** parent file path → raw edge weight (for rank + proportional split) */
		parents: Map<string, number>;
	};
	const recs = new Map<string, PkgRec>();

	for (const fPath of importTree.keys()) {
		const entry = importTree.get(fPath)!;
		if (nodeRef[entry.lab]?.kind === 'bucket') continue;
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

	const findExistingExternalPkg = (
		kind: AlluvialNodeRef['kind'],
		id: string,
	): string | undefined => {
		for (const [name, ref] of Object.entries(nodeRef)) {
			if (ref.kind !== kind || ref.id !== id) continue;
			if (nodeMeta.get(name)?.category === EXTERNAL_IMPORT_CATEGORY) return name;
		}
		return undefined;
	};

	const already: PkgRec[] = [];
	const fresh: PkgRec[] = [];
	for (const rec of recs.values()) {
		if (findExistingExternalPkg(rec.ref.kind, rec.ref.id)) already.push(rec);
		else fresh.push(rec);
	}
	fresh.sort(
		(a, b) =>
			b.rank - a.rank || a.preferredLabel.localeCompare(b.preferredLabel),
	);
	const keptFresh = fresh.slice(0, maxPerHop);
	const overflowFresh = fresh.slice(maxPerHop);
	const activeRecs = [...already, ...keptFresh];

	// parent path → list of { rec, raw } for residual allocation (kept only)
	const byParent = new Map<string, { rec: PkgRec; raw: number }[]>();
	for (const rec of activeRecs) {
		for (const [fPath, raw] of rec.parents) {
			const list = byParent.get(fPath) ?? [];
			list.push({ rec, raw });
			byParent.set(fPath, list);
		}
	}
	// Allocated parent → pkgKey → display weight
	const allocated = new Map<string, Map<string, number>>();
	for (const [fPath, items] of byParent) {
		const residual = residualMass.get(fPath) ?? 0;
		// Only spend mass that actually reached this parent. Inventing unit
		// weights when residual is 0 creates free-source islands
		// (types/user→zod with no users→types/user under integer split).
		if (residual <= 0) continue;
		const rawTotal = items.reduce((s, it) => s + it.raw, 0);
		if (rawTotal <= 0) continue;
		// Cap at residual and at raw package-edge total (no inflate past either)
		const budget = Math.min(residual, rawTotal);
		if (budget <= 0) continue;
		const shares = allocateProportional(
			budget,
			items.map((it) => ({ key: it.rec.key, raw: it.raw })),
		);
		const m = allocated.get(fPath) ?? new Map<string, number>();
		for (const [pkgKey, w] of shares) m.set(pkgKey, w);
		allocated.set(fPath, m);
	}
	// Overflow: skipped (structure via re-hub); residual already spent on kept.

	const ensurePkgNode = (rec: PkgRec): string => {
		const existing = findExistingExternalPkg(rec.ref.kind, rec.ref.id);
		if (existing) return existing;
		const name = claimName(usedNames, rec.preferredLabel, rec.ref.kind);
		nodeRef[name] = rec.ref;
		nodeMeta.set(name, {
			category: EXTERNAL_IMPORT_CATEGORY,
			color: rec.color,
		});
		return name;
	};

	const linkParentAlloc = (pkgName: string, rec: PkgRec) => {
		for (const fPath of rec.parents.keys()) {
			const w = allocated.get(fPath)?.get(rec.key) ?? 0;
			if (w <= 0) continue;
			const parent = importTree.get(fPath);
			if (!parent || nodeRef[parent.lab]?.kind === 'bucket') continue;
			const fromDist = parent.dist;
			const toDist = Math.max(externalDist, fromDist + 1);
			padBetween(parent.lab, fromDist, pkgName, toDist, w);
		}
	};

	for (const rec of activeRecs) {
		linkParentAlloc(ensurePkgNode(rec), rec);
	}
	if (overflowFresh.length) {
		const otherName = claimName(
			usedNames,
			moreCountLabel(overflowFresh.length),
			'external-tree-pkgs',
		);
		nodeRef[otherName] = { kind: 'bucket', id: 'other-external-tree-pkgs' };
		nodeMeta.set(otherName, {
			category: EXTERNAL_IMPORT_CATEGORY,
			color: TEAL.other,
		});
		for (const rec of overflowFresh) {
			linkParentAlloc(otherName, rec);
		}
	}
}

/**
 * Integer proportional split of `budget` by raw weights (largest remainder).
 * Keys with raw≤0 are skipped; if all raw≤0, split budget evenly.
 */
function allocateProportional(
	budget: number,
	items: { key: string; raw: number }[],
): Map<string, number> {
	const out = new Map<string, number>();
	if (budget <= 0 || !items.length) return out;
	const positive = items.filter((it) => it.raw > 0);
	const use = positive.length ? positive : items.map((it) => ({ ...it, raw: 1 }));
	const totalRaw = use.reduce((s, it) => s + it.raw, 0);
	if (totalRaw <= 0) return out;
	let assigned = 0;
	const frac: { key: string; floor: number; rem: number }[] = [];
	for (const it of use) {
		const exact = (budget * it.raw) / totalRaw;
		const floor = Math.floor(exact);
		frac.push({ key: it.key, floor, rem: exact - floor });
		assigned += floor;
	}
	frac.sort((a, b) => b.rem - a.rem || a.key.localeCompare(b.key));
	let left = budget - assigned;
	for (const f of frac) {
		let w = f.floor;
		if (left > 0) {
			w += 1;
			left -= 1;
		}
		if (w > 0) out.set(f.key, (out.get(f.key) ?? 0) + w);
	}
	return out;
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

type ImportTreePadResult = {
	/** path → label + longest-path dist for kept non-bucket import-tree files */
	tree: Map<string, { lab: string; dist: number }>;
	maxFileDist: number;
	/**
	 * Hub mass still sitting on each kept file after File→file routing.
	 * Tree package sinks spend this residual (not raw importer-loc of the leaf).
	 */
	residualMass: Map<string, number>;
	padFromFile: (targetLab: string, toDist: number, w: number) => void;
	padBetween: (
		fromLab: string,
		fromDist: number,
		toLab: string,
		toDist: number,
		w: number,
	) => void;
};

/**
 * Forward multi-hop file deps on **Imports / Import hop N** (file→file only).
 * Packages are placed later as External sinks ({@link addFocusPackageImports} /
 * {@link addExportTreePackageImports}).
 */
function addExportRings(
	args: LinkBuilder & {
		fileId: string;
		/** File→file out-edges only (packages handled as External). */
		outEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
		packageLeafMode: PackageLeafMode;
		classicLabels?: Map<string, string>;
	},
): ImportTreePadResult {
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

	// Pad helpers always available for External package placement
	const ensureImportRailsUpTo = (maxStage: number) => {
		const cap = Math.max(maxStage, radiusR, 1);
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
		ensureImportRailsUpTo(toDist - 1);
		let prev = fromLab;
		for (let stage = fromDist + 1; stage < toDist; stage++) {
			const rail = importRailId(stage);
			addLink(prev, rail, w);
			prev = rail;
		}
		addLink(prev, toLab, w);
	};
	const padFromFile = (targetLab: string, toDist: number, w: number) => {
		padBetween(fileLabel, 0, targetLab, toDist, w);
	};

	if (!fileSeed.size) {
		return {
			tree: new Map(),
			maxFileDist: 0,
			residualMass: new Map(),
			padFromFile,
			padBetween,
		};
	}

	/**
	 * Multi-instance placement: one file node per (path, hop dist).
	 * Seeds always get an instance at dist 1 (File→seed). Edge expansion then
	 * creates deeper instances so analytics→redis/logger branches even when
	 * redis/logger are also direct focus seeds (single-path identity collapsed
	 * those edges). Packages still collapse by package id later.
	 */
	const filesAt = new Map<number, string[]>();
	const placeAt = (path: string, d: number) => {
		if (d < 1 || d > radiusR || path === fileId) return false;
		const list = filesAt.get(d) ?? [];
		if (list.includes(path)) return false;
		list.push(path);
		filesAt.set(d, list);
		return true;
	};

	// Seeds on Imports
	for (const path of fileSeed.keys()) {
		if (path === fileId) continue;
		placeAt(path, 1);
	}
	// Edge expansion from every instance (fixed-point within radius)
	let grew = true;
	while (grew) {
		grew = false;
		for (let d = 1; d < radiusR; d++) {
			for (const path of [...(filesAt.get(d) ?? [])]) {
				for (const child of fwdAdj.get(path) ?? []) {
					if (child === fileId) continue;
					if (placeAt(child, d + 1)) grew = true;
				}
			}
		}
	}
	// Non-seed files only on longest path (not edge-expanded) — rare orphans
	for (const [path, rawD] of dist) {
		if (rawD < 1 || path === fileId || fileSeed.has(path)) continue;
		const d = Math.min(rawD, radiusR);
		if (![...filesAt.values()].some((list) => list.includes(path))) {
			placeAt(path, d);
		}
	}

	/** Instance key path@dist for mass / labels (multi-instance safe). */
	const ik = (path: string, d: number) => `${path}\0${d}`;
	const display = new Map<string, string>(); // ik → label
	const keptByDist = new Map<number, string[]>(); // dist → paths kept
	const mass = new Map<string, number>(); // ik → mass
	/** Mass that reached each path (any instance) — package budget (not leftover after file children). */
	const arrivedByPath = new Map<string, number>();
	const noteArrived = (path: string, w: number) => {
		if (w <= 0) return;
		arrivedByPath.set(path, (arrivedByPath.get(path) ?? 0) + w);
	};

	const fileHasPackageOut = (path: string): boolean => {
		for (const e of graph.edges) {
			if (e.from !== path) continue;
			if (e.toKind === 'package' || e.toKind === 'unresolved') return true;
		}
		return false;
	};

	// --- Materialize nodes hop by hop ---
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
				if (!keptSet.has(f)) display.set(ik(f, d), otherName);
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
			// Deeper instances of a seed need a distinct display name
			const isExtraInstance = d > 1 && fileSeed.has(f);
			const preferred = isExtraInstance
				? hopNodeDisplay(`${base} · h${d}`, 'out', d, radiusR, true)
				: hopNodeDisplay(base, 'out', d, radiusR, plainHopLabels);
			const name = claimName(
				usedNames,
				preferred,
				isExtraInstance ? `h${d}` : plainHopLabels ? 'file' : `out h${d}`,
			);
			display.set(ik(f, d), name);
			nodeRef[name] = { kind: 'file', id: f };
			nodeMeta.set(name, {
				category: importHopCategory(d),
				color: importHopColor(d, radiusR),
			});
		}
	}

	// --- Seed focus out-mass: File → seed instance @ dist 1 only ---
	for (const [f, w] of fileSeed) {
		if (w <= 0) continue;
		const lab = display.get(ik(f, 1));
		if (!lab) continue;
		addLink(fileLabel, lab, w);
		if (nodeRef[lab]?.kind !== 'bucket') {
			mass.set(ik(f, 1), (mass.get(ik(f, 1)) ?? 0) + w);
			noteArrived(f, w);
		}
	}

	// --- Route mass parent@d → child@(d+1) when real edge exists ---
	for (let d = 1; d < radiusR; d++) {
		const parents = [...(keptByDist.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of parents) {
			const fromKey = ik(f, d);
			const m = mass.get(fromKey) ?? 0;
			if (m <= 0) continue;
			const fromLab = display.get(fromKey);
			if (!fromLab || nodeRef[fromLab]?.kind === 'bucket') continue;

			const targets: { lab: string; path: string; key: string }[] = [];
			for (const c of fwdAdj.get(f) ?? []) {
				const toLab = display.get(ik(c, d + 1));
				if (!toLab) continue;
				targets.push({ lab: toLab, path: c, key: ik(c, d + 1) });
			}
			if (!targets.length) continue;

			targets.sort(
				(a, b) =>
					Number(fileHasPackageOut(b.path)) -
						Number(fileHasPackageOut(a.path)) ||
					a.path.localeCompare(b.path),
			);

			const base = Math.floor(m / targets.length);
			let rem = m - base * targets.length;
			for (const t of targets) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				addLink(fromLab, t.lab, share);
				if (nodeRef[t.lab]?.kind !== 'bucket') {
					mass.set(t.key, (mass.get(t.key) ?? 0) + share);
					noteArrived(t.path, share);
				}
			}
			mass.set(fromKey, 0);
		}
	}

	// Packages: one tree entry per path → deepest kept instance (packages collapse)
	// Budget = mass that **arrived** at the path (not leftover after file children),
	// so redis→ioredis still appears when redis also forwards mass to logger.
	const tree = new Map<string, { lab: string; dist: number }>();
	const residualMass = new Map<string, number>();
	let maxFileDist = 0;
	const pathDepths = new Map<string, number[]>();
	for (const [d, paths] of keptByDist) {
		for (const f of paths) {
			const list = pathDepths.get(f) ?? [];
			list.push(d);
			pathDepths.set(f, list);
			if (d > maxFileDist) maxFileDist = d;
		}
	}
	for (const [f, depths] of pathDepths) {
		// Attach packages from the **shallowest** instance (usually the seed).
		// Deepest multi-instances can be free sources if mass never reached them,
		// which pulled External packages into the leftmost Carbon free-source layer.
		const shallow = Math.min(...depths);
		const lab = display.get(ik(f, shallow));
		if (!lab || nodeRef[lab]?.kind === 'bucket') continue;
		tree.set(f, { lab, dist: shallow });
		const arrived = arrivedByPath.get(f) ?? 0;
		if (arrived > 0) residualMass.set(f, arrived);
	}
	// silence unused longest map when multi-instance fully covers
	void dist;
	return {
		tree,
		maxFileDist,
		residualMass,
		padFromFile,
		padBetween,
	};
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
