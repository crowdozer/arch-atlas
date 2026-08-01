/**
 * Exports* (reverse / consumer) rings + depth-1 folder collapse.
 *
 * **Naming trap (keep names):** `addImportRings`, `ensureImportRails`,
 * `padImportRailsInto`, `addImportModules` build the **left** side
 * (Exports / Export hop N) - reverse inbound importers only.
 * See `.grok/reference/hub-alluvial-behavior.md` §2 / field notes E1.
 */

import {
	fileDistances,
	fileImportedByAdj,
} from '@core/catalog/deepest.ts';
import type {
	AlluvialNodeRef,
	ImportEdge,
} from '@core/graph/types.ts';
import {
	moreCountLabel,
	TEAL,
	uniqueFileLabels,
} from '@core/view/alluvial.ts';
import { CHART_PALETTE } from '@core/view/chartPalette.ts';
import { importerGroupKey } from '@core/view/fileImporters.ts';
import {
	exportHopCategory,
	exportHopColor,
	exportRailId,
} from '@core/view/hubCategories.ts';
import {
	allocateProportional,
	claimName,
	edgeWeightIntoSet,
	type LinkBuilder,
} from '@core/view/hubLinkUtils.ts';
import { hubReverseEdgeWeight } from '@core/view/weight.ts';

/**
 * Reverse multi-hop: outer importers → … → Imports (dist-1) → File.
 * Mass = focus-incident reverse edges, routed outward for structure.
 * Outer hops ranked by connectivity into the kept inner ring.
 *
 * Returns display names of reverse free sources (no kept outer reverse parent)
 * - hub terminators for cyan polish chrome. Includes single-hop Exports leaves
 * (no pad) and multi-hop free sources (padded when d < radiusL).
 */
export function addImportRings(
	args: LinkBuilder & {
		fileId: string;
		inEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
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
		edgeWeightOpts,
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

	// Focus-incident mass on dist-1 importers.
	// Use hub reverse mass (not plain target-loc): reverse edges share e.to=focus,
	// which made every export band identical under Imported LOC.
	const seedMass = new Map<string, number>();
	for (const e of inEdges) {
		const w = hubReverseEdgeWeight(e, graph, weightAxis, edgeWeightOpts);
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
			nodeRef[otherName] = { kind: 'bucket', id: `other-import-h${d}` };
			nodeMeta.set(otherName, {
				category: exportHopCategory(d),
				color: TEAL.other,
			});
		}

		const pathLabels = classicLabels ?? uniqueFileLabels(kept);
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

	// Route mass outward: outer (d+1) → inner (d); include overflow via display.has.
	// Proportional by reverse edge weight into the inner (not equal-split) so
	// multi-hop export rings match seed ranking under target-loc / exact.
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

			const shares = allocateProportional(
				m,
				outer.map((p) => ({
					key: p,
					raw:
						edgeWeightIntoSet(
							graph,
							p,
							new Set([f]),
							weightAxis,
							edgeWeightOpts,
						) || 1,
				})),
			);
			for (const p of outer) {
				const share = shares.get(p) ?? 0;
				if (share <= 0) continue;
				const outerLab = display.get(p)!;
				addLink(outerLab, innerLab, share);
				mass.set(p, (mass.get(p) ?? 0) + share);
			}
		}
	}

	// Reverse free sources = no kept outer reverse parent (export-tree dead-ends).
	// Multi-hop: pad short free sources so BFS dist shares one sankey column.
	// Single-hop (radiusL === 1): still mark Exports free sources for cyan chrome
	// (e.g. AdminFlags ← dashboard only - no Export hop 2, previously skipped).
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
			// Pad short paths only when multi-hop columns exist (d < radiusL).
			if (radiusL >= 2 && d < radiusL) {
				padImportRailsInto(addLink, lab, d, radiusL, m);
			}
			// Cyan chrome: all reverse free sources (padded short paths, outer rim
			// at radiusL, and single-column Exports when max reverse hops is 1).
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

/** Register shared import rails (hidden labels) for stages 2..radius. */
export function ensureImportRails(
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
export function padImportRailsInto(
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

/** Depth-1 folder collapse when fan-in is large (Exports category modules). */
export function addImportModules(
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
		edgeWeightOpts,
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
			addLink(source, fileLabel, n);
			nodeRef[source] = { kind: 'module', id: mod };
			nodeMeta.set(source, {
				category: 'Exports',
				color: CHART_PALETTE.exportFree,
			});
		} else if (otherLabel) {
			addLink(otherLabel, fileLabel, n);
		}
	}
	if (otherLabel) {
		nodeRef[otherLabel] = { kind: 'bucket', id: 'other-import-modules' };
		nodeMeta.set(otherLabel, {
			category: 'Exports',
			color: CHART_PALETTE.exportFreeOther,
		});
	}
}
