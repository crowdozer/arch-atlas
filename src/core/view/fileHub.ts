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
 * **Hop labels:** plain path basenames (hop is column category only). Multi-instance
 * dual-path extras still get `path · hN` for second+ instances of the same path.
 *
 * Integer multi-parent split conserves File incident mass (accepted default).
 *
 * **Module layout (construction stages):**
 * - `hubCategories.ts` — categories, rails, display tags, hop colors
 * - `hubLinkUtils.ts` — LinkBuilder, claimName, edge weights, allocate
 * - `hubExportRings.ts` — reverse/Exports* (`addImportRings`, rails, modules)
 * - `hubImportRings.ts` — forward/Imports* (`addExportRings`, multi-instance)
 * - `hubExternalPackages.ts` — External packages, straighten pairs, forward terms
 *
 * Naming trap: `addImportRings` = Exports side; `addExportRings` = Imports side.
 */

import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
} from '@core/graph/types.ts';
import {
	buildAlluvialPayload,
	TEAL,
	uniqueFileLabels,
	type WeightAxis,
} from '@core/view/alluvial.ts';
import {
	fileInDegree,
	fileOutDegree,
} from '@core/view/fileImporters.ts';
import {
	EXTERNAL_IMPORT_CATEGORY,
	displayHubCategory,
	exportHopCategory,
	importHopCategory,
} from '@core/view/hubCategories.ts';
import {
	addExportTreePackageImports,
	addFocusPackageImports,
	collectForwardTerminators,
} from '@core/view/hubExternalPackages.ts';
import {
	addImportModules,
	addImportRings,
} from '@core/view/hubExportRings.ts';
import { addExportRings } from '@core/view/hubImportRings.ts';
import {
	pickEdgeWeightOpts,
	resolveWeightAxis,
	unitsForAxis,
	type EdgeWeightOpts,
	type LocPrecision,
} from '@core/view/weight.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';

// Public re-exports (facade freezes import path @core/view/fileHub.ts)
export {
	EXTERNAL_IMPORT_CATEGORY,
	displayHubCategory,
	exportHopCategory,
	exportRailId,
	importHopCategory,
	importRailId,
	isImportSideCategory,
} from '@core/view/hubCategories.ts';

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
		precision?: LocPrecision;
		surface?: ImportedSurfaceProvider | null;
	},
): AlluvialPayload | null {
	if (!graph.files.has(fileId)) return null;

	const heightPx = opts?.heightPx ?? 400;
	const maxImporters = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxDeps = opts?.maxDeps ?? DEFAULT_MAX_DEPS;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
	const hubRadius = Math.max(1, Math.floor(opts?.maxDepth ?? HUB_DEFAULT_MAX_DEPTH));
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const edgeWeightOpts: EdgeWeightOpts | undefined = pickEdgeWeightOpts(opts);
	const units = unitsForAxis(weightAxis, 'import-edges', opts?.precision);

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
	/** Reverse free sources / export-tree dead-ends (cyan polish chrome). */
	const terminators: string[] = [];
	/**
	 * Construction-time parent → External package widths (display labels).
	 * Polish straighten uses this list so shared in-rails do not invent a
	 * parent×package cross-product.
	 */
	const externalStraightPairs: {
		parent: string;
		packageName: string;
		width: number;
	}[] = [];

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
				edgeWeightOpts,
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
				edgeWeightOpts,
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
		edgeWeightOpts,
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
			edgeWeightOpts,
			externalDist,
			padFromFile: importTreeResult.padFromFile,
			externalStraightPairs,
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
			edgeWeightOpts,
			externalDist,
			padBetween: importTreeResult.padBetween,
			externalStraightPairs,
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
		ariaLabel: `Hub imports and exports for ${fileId} (viz depth ${hubRadius})`,
		terminators: terminators.length ? terminators : undefined,
		exportTerminators: exportTerminators.length
			? exportTerminators
			: undefined,
		externalStraightPairs: externalStraightPairs.length
			? externalStraightPairs
			: undefined,
	});
}
