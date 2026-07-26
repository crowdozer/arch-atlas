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
 * dist-1 categories stay `Imports` / `Exports`; outer rings `Import hop k` /
 * `Export hop k` (k≥2). Packages/unresolved appear only on export dist-1 from
 * focus out-edges. Folder collapse (importerGroupKey) only at depth=1.
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
/** Barrel / hub default viz depth (hop radius both sides). */
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

/** dist-1 keeps Imports/Exports; outer rings are Import hop k / Export hop k. */
export function importHopCategory(dist: number): string {
	return dist <= 1 ? 'Imports' : `Import hop ${dist}`;
}

export function exportHopCategory(dist: number): string {
	return dist <= 1 ? 'Exports' : `Export hop ${dist}`;
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

	const fileLabel = basename(fileId);
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
		const importerPaths = [...new Set(inEdges.map((e) => e.from))];
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
 * Reverse multi-hop: outer importers → … → Imports (dist-1) → File.
 * Mass = focus-incident reverse edges, routed outward for structure.
 */
function addImportRings(
	args: LinkBuilder & {
		fileId: string;
		inEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
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

	// Rank per hop by seed mass (dist-1) or connectivity; keep top maxPerHop
	const display = new Map<string, string>();
	const allKept: string[] = [];
	const overflowByDist = new Map<number, string>();
	for (let d = 1; d <= radiusL; d++) {
		const files = filesAt.get(d) ?? [];
		const ranked = [...files].sort(
			(a, b) =>
				(seedMass.get(b) ?? 0) - (seedMass.get(a) ?? 0) ||
				a.localeCompare(b),
		);
		const kept = ranked.slice(0, maxPerHop);
		const keptSet = new Set(kept);
		const otherCount = ranked.length - kept.length;
		allKept.push(...kept);
		if (otherCount > 0) {
			const preferred =
				radiusL <= 1
					? moreCountLabel(otherCount)
					: hopOverflowLabel(moreCountLabel(otherCount), 'in', d);
			const otherName = claimName(usedNames, preferred, `in h${d}`);
			overflowByDist.set(d, otherName);
			for (const f of files) {
				if (!keptSet.has(f)) display.set(f, otherName);
			}
			nodeRef[otherName] = { kind: 'bucket', id: `other-import-h${d}` };
			nodeMeta.set(otherName, {
				category: importHopCategory(d),
				color: TEAL.other,
			});
		}
	}

	const pathLabels = uniqueFileLabels(allKept);
	for (const f of allKept) {
		const d = dist.get(f) ?? 1;
		const base = pathLabels.get(f) ?? basename(f);
		const preferred = hopFileLabel(base, 'in', d, radiusL);
		const name = claimName(usedNames, preferred, `in h${d}`);
		display.set(f, name);
		nodeRef[name] = { kind: 'file', id: f };
		nodeMeta.set(name, {
			category: importHopCategory(d),
			color: importHopColor(d, radiusL),
		});
	}

	// Mass on nodes (starts as seed at dist-1; routed outward)
	const mass = new Map<string, number>();
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

	// Route mass outward: for each dist d, split among reverse-neighbors at d+1
	// so flow reads L→R: outer → … → dist-1 → File
	for (let d = 1; d < radiusL; d++) {
		const filesHere = [...(filesAt.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of filesHere) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const innerLab = display.get(f);
			if (!innerLab) continue;

			// Who imports f at dist d+1 (BFS-consistent consecutive ring)
			const outer = (revAdj.get(f) ?? []).filter((p) => dist.get(p) === d + 1);
			const outerKept = outer.filter((p) => display.has(p));
			if (!outerKept.length) continue;

			// Prefer parents that actually have seed-descended mass path; split evenly
			const base = Math.floor(m / outerKept.length);
			let rem = m - base * outerKept.length;
			for (const p of outerKept) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;
				const outerLab = display.get(p)!;
				addLink(outerLab, innerLab, share);
				mass.set(p, (mass.get(p) ?? 0) + share);
			}
		}
	}
}

/**
 * Forward multi-hop: File → Exports (dist-1 files + pkgs) → … → Export hop N.
 * Mass = focus-incident out edges; packages only from focus on dist-1.
 */
function addExportRings(
	args: LinkBuilder & {
		fileId: string;
		outEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
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

	// Rank per hop (files only). Dist-1 files later compete with packages for slots.
	const display = new Map<string, string>();
	const keptByDist = new Map<number, string[]>();
	for (let d = 1; d <= radiusR; d++) {
		const files = filesAt.get(d) ?? [];
		const ranked = [...files].sort(
			(a, b) =>
				(fileSeed.get(b) ?? 0) - (fileSeed.get(a) ?? 0) ||
				a.localeCompare(b),
		);
		// Outer hops use full per-hop cap; dist-1 shares budget with packages below
		const cap = d === 1 ? ranked.length : maxPerHop;
		const kept = ranked.slice(0, cap);
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
	}

	// Claim file labels for hops ≥ 2 first (dist-1 waits for combined ranking)
	for (let d = 2; d <= radiusR; d++) {
		const kept = keptByDist.get(d) ?? [];
		const pathLabels = uniqueFileLabels(kept);
		for (const f of kept) {
			const base = pathLabels.get(f) ?? basename(f);
			const preferred = hopFileLabel(base, 'out', d, radiusR);
			const name = claimName(usedNames, preferred, `out h${d}`);
			display.set(f, name);
			nodeRef[name] = { kind: 'file', id: f };
			nodeMeta.set(name, {
				category: exportHopCategory(d),
				color: exportHopColor(d, radiusR),
			});
		}
	}

	// Combined dist-1 ranking: files + packages (parity with classic maxDeps)
	type RankedExport = {
		kind: 'file' | 'nonfile';
		key: string;
		weight: number;
		preferredLabel: string;
		entry?: NonFileDep;
	};
	const dist1Files = keptByDist.get(1) ?? filesAt.get(1) ?? [];
	const dist1Labels = uniqueFileLabels(dist1Files);
	const combined: RankedExport[] = [];
	for (const f of dist1Files) {
		combined.push({
			kind: 'file',
			key: f,
			weight: fileSeed.get(f) ?? 0,
			preferredLabel: hopFileLabel(
				dist1Labels.get(f) ?? basename(f),
				'out',
				1,
				radiusR,
			),
		});
	}
	// Disambiguate duplicate package preferred labels before ranking
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

	const mass = new Map<string, number>();

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

	for (const item of overflowCombined) {
		if (!exportOtherLabel) continue;
		addLink(fileLabel, exportOtherLabel, item.weight);
	}

	if (exportOtherLabel) {
		nodeRef[exportOtherLabel] = { kind: 'bucket', id: 'other-exports' };
		nodeMeta.set(exportOtherLabel, {
			category: 'Exports',
			color: TEAL.exportOther,
		});
	}

	// Route file mass outward along consecutive export distances
	for (let d = 1; d < radiusR; d++) {
		const filesHere = [...(filesAt.get(d) ?? [])].sort((a, b) =>
			a.localeCompare(b),
		);
		for (const f of filesHere) {
			const m = mass.get(f) ?? 0;
			if (m <= 0) continue;
			const fromLab = display.get(f);
			if (!fromLab) continue;

			// Only route to kept file nodes (not overflow buckets)
			const childFiles = (fwdAdj.get(f) ?? []).filter((c) => {
				if (dist.get(c) !== d + 1) return false;
				const lab = display.get(c);
				return lab !== undefined && nodeRef[lab]?.kind === 'file';
			});
			if (!childFiles.length) continue;

			const base = Math.floor(m / childFiles.length);
			let rem = m - base * childFiles.length;
			for (const c of childFiles) {
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
