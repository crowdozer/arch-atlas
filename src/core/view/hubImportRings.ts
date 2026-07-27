/**
 * Imports* (forward / file-deps) multi-instance rings.
 *
 * **Naming trap (keep names):** `addExportRings` builds the **right** side
 * (Imports / Import hop N) — outbound file deps only, multi-instance dual-path.
 * Packages land later as External sinks. See hub-alluvial-behavior.md / E1.
 */

import {
	fileImportAdj,
	fileLongestDistances,
} from '@core/catalog/deepest.ts';
import type { ImportEdge } from '@core/graph/types.ts';
import {
	moreCountLabel,
	TEAL,
	uniqueFileLabels,
} from '@core/view/alluvial.ts';
import {
	importHopCategory,
	importHopColor,
	importRailId,
} from '@core/view/hubCategories.ts';
import {
	claimName,
	edgeWeightFromSet,
	type LinkBuilder,
} from '@core/view/hubLinkUtils.ts';
import { edgeWeight } from '@core/view/weight.ts';

export type ImportTreePadResult = {
	/** path → label + longest-path dist for kept non-bucket import-tree files */
	tree: Map<string, { lab: string; dist: number }>;
	maxFileDist: number;
	/**
	 * Reserved package share per kept file (after reserve-then-route).
	 * Tree package sinks spend this residual (capped by raw package-edge total).
	 * Scarce dual-spend may leave residual equal to min(arrived, rawPkg) while
	 * file children also received full arrived mass (unit-edge E7 case).
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
export function addExportRings(
	args: LinkBuilder & {
		fileId: string;
		/** File→file out-edges only (packages handled as External). */
		outEdges: ImportEdge[];
		hubRadius: number;
		maxPerHop: number;
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
		weightAxis,
		addLink,
		nodeRef,
		nodeMeta,
		usedNames,
		classicLabels,
	} = args;

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
	/** Mass that reached each path (any instance) — used to build reserved residual. */
	const arrivedByPath = new Map<string, number>();
	const noteArrived = (path: string, w: number) => {
		if (w <= 0) return;
		arrivedByPath.set(path, (arrivedByPath.get(path) ?? 0) + w);
	};

	/** Raw package/unresolved out-weight for path (same basis as package spend). */
	const rawPkgWeight = (path: string): number => {
		let s = 0;
		for (const e of graph.edges) {
			if (e.from !== path) continue;
			if (e.toKind === 'package' || e.toKind === 'unresolved') {
				s += edgeWeight(e, graph, weightAxis);
			}
		}
		return s;
	};

	const fileHasPackageOut = (path: string): boolean => {
		return rawPkgWeight(path) > 0;
	};

	/**
	 * Remaining package-reserve capacity per path (multi-instance safe).
	 * First instance that routes consumes up to rawPkg; later instances route
	 * full mass to file children so residual is not double-counted.
	 */
	const pkgRoomLeft = new Map<string, number>();
	const takePkgReserve = (path: string, m: number): number => {
		if (!pkgRoomLeft.has(path)) pkgRoomLeft.set(path, rawPkgWeight(path));
		const room = pkgRoomLeft.get(path) ?? 0;
		const take = Math.min(m, room);
		if (take > 0) pkgRoomLeft.set(path, room - take);
		return take;
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
			const preferred = moreCountLabel(otherCount);
			const otherName = claimName(usedNames, preferred, 'more');
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
			// Any second+ hop instance of a path needs a distinct label
			// (seed extras and multi-hop non-seeds — avoid claimName "· file")
			const hasShallower = [...Array(d).keys()].some(
				(sd) => sd >= 1 && display.has(ik(f, sd)),
			);
			const isExtraInstance = d > 1 && (fileSeed.has(f) || hasShallower);
			const preferred = isExtraInstance ? `${base} · h${d}` : base;
			const name = claimName(
				usedNames,
				preferred,
				isExtraInstance ? `h${d}` : 'file',
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
	// Reserve package budget first, then equal-split only the remainder among
	// file children (Kirchhoff when mass can cover both). Scarce dual-spend:
	// if reserve would starve all file children, route full m to files AND keep
	// package residual so unit-weight edges still show External packages.
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

			const pkgReserve = takePkgReserve(f, m);
			let fileMass = m - pkgReserve;
			// Scarce dual-spend: unit (or tight) mass would leave file children
			// with nothing after package reserve — route full arrived to files
			// while residual still claims pkgReserve via residualMass map.
			if (fileMass === 0 && targets.length > 0 && m > 0) {
				fileMass = m;
			}

			const base = Math.floor(fileMass / targets.length);
			let rem = fileMass - base * targets.length;
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

	// Packages: one tree entry per path → shallowest kept instance (packages collapse).
	// Residual = reserved package share min(arrived, rawPkg) — not full arrived —
	// matching reserve-then-route (scarce dual-spend still yields residual > 0).
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
		if (arrived <= 0) continue;
		const pkgR = Math.min(arrived, rawPkgWeight(f));
		// Always record reserved share (0 when no package outs — spend skips it).
		residualMass.set(f, pkgR);
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
