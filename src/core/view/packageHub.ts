/**
 * Package-hub alluvial — dep-rooted reverse export chain.
 *
 * Columns (L→R):
 *   Export hop N … → Exports → External(dep)
 *
 * **Product law**
 * - **External:** the opened package/unresolved as a single sink (never a free
 *   source). `externalStraightPairs` lists every kept importer → package edge
 *   so LogicalFocusGraph package seed lights reverse∪ across all pair parents.
 * - **Exports / Export hop k:** multi-seed reverse BFS on the **file** graph
 *   from all direct importers of the package (shortest path / same ring ranking
 *   and mass routing as file-hub reverse).
 * - **Omitted:** File spine, Imports*, multi-package External tree.
 *
 * Reuses file-hub reverse mass/overflow/depth patterns without calling
 * {@link projectFileHub}. File-hub matrix stays unchanged.
 *
 * Edge orientation remains A → B means A imports B (importer → package).
 */

import { fileImportedByAdj } from '@core/catalog/deepest.ts';
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
import { CHART_PALETTE } from '@core/view/chartPalette.ts';
import { importerGroupKey } from '@core/view/fileImporters.ts';
import { HUB_DEFAULT_MAX_DEPTH } from '@core/view/fileHub.ts';
import {
	EXTERNAL_IMPORT_CATEGORY,
	exportHopCategory,
	exportHopColor,
} from '@core/view/hubCategories.ts';
import {
	ensureImportRails,
	padImportRailsInto,
} from '@core/view/hubExportRings.ts';
import {
	claimName,
	edgeWeightIntoSet,
} from '@core/view/hubLinkUtils.ts';
import { edgeMatchesPackage } from '@core/view/packageImporters.ts';
import {
	hubReverseEdgeWeight,
	pickEdgeWeightOpts,
	resolveWeightAxis,
	unitsForAxis,
	type EdgeWeightOpts,
	type LocPrecision,
} from '@core/view/weight.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';

const FILE_PROMOTE_THRESHOLD = 12;
const DEFAULT_MAX_IMPORTERS = 16;
const DEFAULT_MAX_MODULES = 12;

/**
 * Multi-seed shortest-path distances on reverse file adj.
 * Seeds (direct package importers) start at dist 1; package is conceptual dist 0.
 */
function multiSeedReverseDistances(
	seeds: readonly string[],
	revAdj: Map<string, string[]>,
): { dist: Map<string, number>; maxHops: number } {
	const dist = new Map<string, number>();
	const q: string[] = [];
	for (const s of seeds) {
		if (dist.has(s)) continue;
		dist.set(s, 1);
		q.push(s);
	}
	let maxHops = seeds.length ? 1 : 0;
	while (q.length) {
		const cur = q.shift()!;
		const d = dist.get(cur) ?? 0;
		if (d > maxHops) maxHops = d;
		for (const n of revAdj.get(cur) ?? []) {
			if (dist.has(n)) continue;
			dist.set(n, d + 1);
			q.push(n);
		}
	}
	return { dist, maxHops };
}

/**
 * Project a package/unresolved end as a reverse export hub.
 * Returns null when no observed importer edges match `packageIdOrLabel`.
 *
 * @param opts.maxDepth Viz-only reverse hop radius (default {@link HUB_DEFAULT_MAX_DEPTH}).
 */
export function projectPackageHub(
	graph: CodeGraph,
	packageIdOrLabel: string,
	opts?: {
		heightPx?: number;
		maxImporters?: number;
		maxModules?: number;
		/** Viz-only reverse hop radius. Does not affect indexing. */
		maxDepth?: number;
		weightAxis?: WeightAxis;
		precision?: LocPrecision;
		surface?: ImportedSurfaceProvider | null;
	},
): AlluvialPayload | null {
	const inEdges = graph.edges.filter((e) =>
		edgeMatchesPackage(e, packageIdOrLabel),
	);
	if (!inEdges.length) return null;

	const heightPx = opts?.heightPx ?? 400;
	const maxImporters = opts?.maxImporters ?? DEFAULT_MAX_IMPORTERS;
	const maxModules = opts?.maxModules ?? DEFAULT_MAX_MODULES;
	const hubRadius = Math.max(1, Math.floor(opts?.maxDepth ?? HUB_DEFAULT_MAX_DEPTH));
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const edgeWeightOpts: EdgeWeightOpts | undefined = pickEdgeWeightOpts(opts);
	const units = unitsForAxis(weightAxis, 'package-mass', opts?.precision);

	// Resolve sink identity from first matching edge (all share package target).
	const sample = inEdges[0]!;
	const pkgKind: 'package' | 'unresolved' =
		sample.toKind === 'unresolved' ? 'unresolved' : 'package';
	const pkgId = sample.to;
	const pkgLabel =
		sample.toKind === 'unresolved'
			? sample.specifier
			: sample.to.replace(/^unresolved:/, '');
	const pkgColor =
		pkgKind === 'unresolved'
			? TEAL.unresolved
			: graph.packages.get(pkgId)?.source === 'builtin'
				? TEAL.builtin
				: TEAL.package;

	const focus: AlluvialFocus = {
		kind: pkgKind,
		id: pkgId,
		label: pkgLabel,
	};

	const linkMap = new Map<string, number>();
	const addLink = (source: string, target: string, value: number) => {
		if (value <= 0 || source === target) return;
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	const nodeRef: Record<string, AlluvialNodeRef> = {
		[pkgLabel]: { kind: pkgKind, id: pkgId },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(pkgLabel, {
		category: EXTERNAL_IMPORT_CATEGORY,
		color: pkgColor,
	});

	const usedNames = new Set<string>([pkgLabel]);
	const terminators: string[] = [];
	const externalStraightPairs: {
		parent: string;
		packageName: string;
		width: number;
	}[] = [];

	const importerPaths = [...new Set(inEdges.map((e) => e.from))];

	// Folder leaf collapse only at depth=1 when fan-in is large (file-hub parity).
	if (hubRadius === 1 && importerPaths.length > FILE_PROMOTE_THRESHOLD) {
		addPackageImportModules({
			graph,
			inEdges,
			importerPaths,
			packageLabel: pkgLabel,
			maxModules: Math.min(maxModules, Math.min(48, maxImporters)),
			weightAxis,
			edgeWeightOpts,
			addLink,
			nodeRef,
			nodeMeta,
			usedNames,
			externalStraightPairs,
		});
	} else {
		const reverseTerminators = addPackageExportRings({
			graph,
			inEdges,
			packageLabel: pkgLabel,
			hubRadius,
			maxPerHop: Math.min(48, maxImporters),
			weightAxis,
			edgeWeightOpts,
			addLink,
			nodeRef,
			nodeMeta,
			usedNames,
		});
		terminators.push(...reverseTerminators);

		// Record straighten pairs for every Exports → External link mass.
		for (const [k, value] of linkMap) {
			const [source, target] = k.split('\0') as [string, string];
			if (target !== pkgLabel) continue;
			const existing = externalStraightPairs.find(
				(p) => p.parent === source && p.packageName === pkgLabel,
			);
			if (existing) existing.width += value;
			else {
				externalStraightPairs.push({
					parent: source,
					packageName: pkgLabel,
					width: value,
				});
			}
		}
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
	for (const name of Object.keys(nodeRef)) {
		if (!used.has(name) && name !== pkgLabel) delete nodeRef[name];
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});
	if (!links.length) return null;

	const present = new Set([...nodeMeta.values()].map((m) => m.category));
	let maxExportHop = hubRadius;
	for (const cat of present) {
		const me = /^Export hop (\d+)$/.exec(cat);
		if (me) maxExportHop = Math.max(maxExportHop, Number(me[1]));
	}
	// Consumers left of External: deeper reverse hops further left
	const exportHopsLeft: string[] = [];
	for (let d = maxExportHop; d >= 2; d--) {
		const cat = exportHopCategory(d);
		if (present.has(cat)) exportHopsLeft.push(cat);
	}
	const categoryOrder = [
		...exportHopsLeft,
		...(present.has('Exports') ? ['Exports'] : []),
		...(present.has(EXTERNAL_IMPORT_CATEGORY)
			? [EXTERNAL_IMPORT_CATEGORY]
			: []),
	].filter((c) => present.has(c));

	// External sink is the sole forward true leaf (yellow polish chrome).
	// Field name on payload is historical (`exportTerminators` = forward leaves).
	const forwardTerminators = used.has(pkgLabel) ? [pkgLabel] : undefined;

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		// No startId: package is External sink, not File spine (module parity).
		// Setting package id would pollute LogicalFocusGraph.fileSpineName.
		units,
		ariaLabel: `Package hub for ${pkgLabel} (viz depth ${hubRadius})`,
		terminators: terminators.length ? terminators : undefined,
		exportTerminators: forwardTerminators,
		externalStraightPairs: externalStraightPairs.length
			? externalStraightPairs
			: undefined,
	});
}

/**
 * Multi-seed reverse rings: Export hop* → Exports → External(package).
 * Mass = package-incident reverse edges, routed outward for structure.
 * Returns reverse free-source display names (cyan polish chrome).
 */
function addPackageExportRings(args: {
	graph: CodeGraph;
	inEdges: ImportEdge[];
	packageLabel: string;
	hubRadius: number;
	maxPerHop: number;
	weightAxis: WeightAxis;
	edgeWeightOpts?: EdgeWeightOpts;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
	usedNames: Set<string>;
}): string[] {
	const {
		graph,
		inEdges,
		packageLabel,
		hubRadius,
		maxPerHop,
		weightAxis,
		edgeWeightOpts,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
	} = args;

	const seedMass = new Map<string, number>();
	for (const e of inEdges) {
		const w = hubReverseEdgeWeight(e, graph, weightAxis, edgeWeightOpts);
		seedMass.set(e.from, (seedMass.get(e.from) ?? 0) + w);
	}
	const seeds = [...seedMass.keys()];
	const revAdj = fileImportedByAdj(graph);
	const { dist, maxHops } = multiSeedReverseDistances(seeds, revAdj);
	const radiusL = Math.min(hubRadius, maxHops);
	if (radiusL < 1) return [];

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
					: edgeWeightIntoSet(graph, a, keptInner, weightAxis, edgeWeightOpts);
			const sb =
				d === 1
					? (seedMass.get(b) ?? 0)
					: edgeWeightIntoSet(graph, b, keptInner, weightAxis, edgeWeightOpts);
			return sb - sa || a.localeCompare(b);
		});
		const kept = ranked.slice(0, maxPerHop);
		const keptSet = new Set(kept);
		keptByDist.set(d, kept);
		const otherCount = ranked.length - kept.length;

		if (otherCount > 0) {
			const preferred = moreCountLabel(otherCount);
			const otherName = claimName(usedNames, preferred, 'more');
			for (const f of files) {
				if (!keptSet.has(f)) display.set(f, otherName);
			}
			nodeRef[otherName] = { kind: 'bucket', id: `other-pkg-import-h${d}` };
			nodeMeta.set(otherName, {
				category: exportHopCategory(d),
				color: TEAL.other,
			});
		}

		const pathLabels = uniqueFileLabels(kept);
		for (const f of kept) {
			const base = pathLabels.get(f) ?? f;
			const name = claimName(usedNames, base, 'file');
			display.set(f, name);
			nodeRef[name] = { kind: 'file', id: f };
			nodeMeta.set(name, {
				category: exportHopCategory(d),
				color: exportHopColor(d, radiusL),
			});
		}
	}

	// Seed mass at dist-1 (including overflow members so mass reaches External)
	for (const [f, w] of seedMass) {
		if ((dist.get(f) ?? 0) === 1) mass.set(f, w);
	}

	// dist-1 → External(package)
	for (const f of filesAt.get(1) ?? []) {
		const m = mass.get(f) ?? 0;
		if (m <= 0) continue;
		const lab = display.get(f);
		if (!lab) continue;
		addLink(lab, packageLabel, m);
	}

	// Route mass outward: outer (d+1) → inner (d)
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

	// Reverse free sources + pad short paths (file-hub reverse parity)
	const receivesOuter = new Set<string>();
	if (radiusL >= 2) {
		ensureImportRails(nodeMeta, nodeRef, radiusL);
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
	}

	const terminatorSet = new Set<string>();
	for (let d = 1; d <= radiusL; d++) {
		for (const f of filesAt.get(d) ?? []) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const lab = display.get(f);
			if (!lab) continue;
			if (receivesOuter.has(lab)) continue;
			if (radiusL >= 2 && d < radiusL) {
				padImportRailsInto(addLink, lab, d, radiusL, m);
			}
			if (
				nodeRef[lab]?.kind === 'file' &&
				!lab.includes('·in-rail') &&
				!lab.includes('·out-rail')
			) {
				terminatorSet.add(lab);
			}
		}
	}
	return [...terminatorSet];
}

/** Depth-1 folder collapse when fan-in is large (Exports category modules). */
function addPackageImportModules(args: {
	graph: CodeGraph;
	inEdges: ImportEdge[];
	importerPaths: string[];
	packageLabel: string;
	maxModules: number;
	weightAxis: WeightAxis;
	edgeWeightOpts?: EdgeWeightOpts;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
	usedNames: Set<string>;
	externalStraightPairs: {
		parent: string;
		packageName: string;
		width: number;
	}[];
}): void {
	const {
		graph,
		inEdges,
		importerPaths,
		packageLabel,
		maxModules,
		weightAxis,
		edgeWeightOpts,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
		externalStraightPairs,
	} = args;

	const groupKey = importerGroupKey(importerPaths);
	const moduleWeights = new Map<string, number>();
	for (const e of inEdges) {
		const mod = groupKey(e.from);
		moduleWeights.set(
			mod,
			(moduleWeights.get(mod) ?? 0) +
				hubReverseEdgeWeight(e, graph, weightAxis, edgeWeightOpts),
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
			addLink(source, packageLabel, n);
			nodeRef[source] = { kind: 'module', id: mod };
			nodeMeta.set(source, {
				category: 'Exports',
				color: CHART_PALETTE.exportFree,
			});
			externalStraightPairs.push({
				parent: source,
				packageName: packageLabel,
				width: n,
			});
		} else if (otherLabel) {
			addLink(otherLabel, packageLabel, n);
		}
	}
	if (otherLabel) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-pkg-import-modules' };
		nodeMeta.set(otherLabel, {
			category: 'Exports',
			color: CHART_PALETTE.exportFreeOther,
		});
		const overflowMass = ranked
			.filter(([k]) => !kept.has(k))
			.reduce((s, [, n]) => s + n, 0);
		if (overflowMass > 0) {
			externalStraightPairs.push({
				parent: otherLabel,
				packageName: packageLabel,
				width: overflowMass,
			});
		}
	}
}
