/**
 * External package sinks + straighten pairs + forward terminator collection.
 *
 * Packages/unresolved only: never free sources; pad past max file import hop
 * when Imports* exist. Residual / Kirchhoff allocate for tree packages.
 * See `.grok/reference/hub-alluvial-behavior.md`.
 */

import type {
	AlluvialNodeRef,
	ImportEdge,
} from '@core/graph/types.ts';
import {
	moreCountLabel,
	TEAL,
} from '@core/view/alluvial.ts';
import { EXTERNAL_IMPORT_CATEGORY } from '@core/view/hubCategories.ts';
import {
	allocateProportional,
	claimName,
	type LinkBuilder,
} from '@core/view/hubLinkUtils.ts';
import { edgeWeight } from '@core/view/weight.ts';

/**
 * Focus-incident package/unresolved → **External** sinks.
 * Links are File → package when externalDist === 1, else File → in-rails →
 * package so Carbon places packages one hop past deepest file Imports.
 * Rails stay sinks (packages never free sources). Paint law keeps File↔rail
 * and rail→package bands visible; only pure rail↔rail is undrawn.
 */
export function addFocusPackageImports(
	args: LinkBuilder & {
		outEdges: ImportEdge[];
		maxPerHop: number;
		/** Hub dist for package nodes (File = 0). */
		externalDist: number;
		padFromFile: (targetLab: string, toDist: number, w: number) => void;
		/** Display parent/package widths for polish straighten (shared rails). */
		externalStraightPairs: {
			parent: string;
			packageName: string;
			width: number;
		}[];
	},
): void {
	const {
		graph,
		fileLabel,
		outEdges,
		maxPerHop,
		weightAxis,
		externalDist,
		padFromFile,
		externalStraightPairs,
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
		recordExternalStraightPair(
			externalStraightPairs,
			fileLabel,
			name,
			entry.weight,
		);
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
			recordExternalStraightPair(
				externalStraightPairs,
				fileLabel,
				otherName,
				entry.weight,
			);
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
export function addExportTreePackageImports(
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
		/** Display parent/package widths for polish straighten (shared rails). */
		externalStraightPairs: {
			parent: string;
			packageName: string;
			width: number;
		}[];
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
		externalStraightPairs,
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
			recordExternalStraightPair(
				externalStraightPairs,
				parent.lab,
				pkgName,
				w,
			);
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

/** Merge construction-time External straighten pairs by (parent, package). */
export function recordExternalStraightPair(
	pairs: { parent: string; packageName: string; width: number }[],
	parent: string,
	packageName: string,
	width: number,
): void {
	if (width <= 0 || !parent || !packageName || parent === packageName) return;
	const existing = pairs.find(
		(p) => p.parent === parent && p.packageName === packageName,
	);
	if (existing) existing.width += width;
	else pairs.push({ parent, packageName, width });
}

/**
 * Forward true leaves on Imports / Import hop / External: non-rail, non-bucket
 * nodes with no out-edge to another non-rail node (packages + rim files).
 * Polish applies **yellow** wrap (contrast on cyan import columns).
 */
export function collectForwardTerminators(
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
