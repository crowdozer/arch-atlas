/**
 * Multi-hop alluvial: outbound import tree as staged columns.
 *
 * Columns L→R: Imports → Hop N → … → Hop 1 → File
 *
 * **Depth (viz-only)** = how many hops to walk from the start file.
 * Indexing/scan stays unbounded; depth only filters this projection.
 *
 * | Depth | Columns                                      |
 * | ----- | -------------------------------------------- |
 * | 1     | Imports → File                               |
 * | 2     | Imports → Hop 1 → File                       |
 * | 3     | Imports → Hop 2 → Hop 1 → File               |
 *
 * ## Topology (why headers stay consecutive)
 *
 * Carbon/d3-sankey places columns by *longest path from sources*, not by our
 * labels. If packages link straight into every hop distance, two files at the
 * same BFS distance can land in different columns (both titled "Hop 2").
 *
 * Fix — layer-consistent topology (no SVG post-process):
 * - Hop column for BFS distance d is sankey layer (maxFileDist − d + 1).
 * - File→file edges only between consecutive distances (d → d−1 → … → File).
 * - Package→file edges are *padded* through shared hop rails so the path
 *   length into a dist-d file is always (maxFileDist − d + 1).
 *
 * Folders are never stages — hop nodes are files (+ overflow).
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
} from '@core/graph/types.ts';
import {
	basename,
	buildAlluvialPayload,
	moreCountLabel,
	projectAlluvial,
	TEAL,
	uniqueFileLabels,
	type WeightAxis,
} from '@core/view/alluvial.ts';
import {
	edgeWeight,
	resolveWeightAxis,
	unitsForAxis,
} from '@core/view/weight.ts';

const DEFAULT_MAX_DEPTH = 7;

/**
 * Intermediate file distance cap for a viz depth.
 * Depth 1 → 0 (start only); depth 2 → 1; depth 3 → 2; …
 */
export function maxFileDistForDepth(depth: number): number {
	const d = Math.max(1, Math.floor(depth));
	return d - 1;
}

/**
 * Map raw BFS depth to hop stage 1..maxFileDist (identity when within cap).
 */
export function stageForDepth(depth: number, maxFileDist: number): number {
	if (depth < 1 || maxFileDist < 1) return 0;
	if (depth <= maxFileDist) return depth;
	return 0;
}

/** Column header for hop distance d (closest to File is Hop 1). */
export function hopCategory(stage: number): string {
	return `Hop ${stage}`;
}

/**
 * Sankey layer (1-based after Imports) for BFS distance d.
 * dist maxFileDist → layer 1 (just right of Imports); dist 1 → layer maxFileDist.
 */
export function layerForDist(dist: number, maxFileDist: number): number {
	if (dist < 1 || maxFileDist < 1) return 0;
	return maxFileDist - dist + 1;
}

function hopNodeLabel(folderOrFile: string, stage: number): string {
	return `${folderOrFile} · h${stage}`;
}

/** Shared rail id for package-path padding at hop stage s. */
function railId(stage: number): string {
	return `\u200b·rail·h${stage}`;
}

/**
 * Multi-hop dependency tree alluvial for a start file.
 *
 * @param opts.maxDepth / maxHopStages Viz depth (UI Depth). Depth 1 = Imports→File.
 */
export function projectMultiHopAlluvial(
	graph: CodeGraph,
	startId: string,
	opts?: {
		heightPx?: number;
		maxHopStages?: number;
		maxDepth?: number;
		maxEnds?: number;
		maxNodesPerHop?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(startId)) return null;

	const heightPx = opts?.heightPx ?? 360;
	const maxDepth = Math.max(
		1,
		opts?.maxDepth ?? opts?.maxHopStages ?? DEFAULT_MAX_DEPTH,
	);
	const maxFileDist = maxFileDistForDepth(maxDepth);
	const maxEnds = opts?.maxEnds ?? 16;
	const maxNodesPerHop = opts?.maxNodesPerHop ?? 12;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'package-mass');
	const passOpts = { heightPx, maxEnds, weightAxis };

	const fwd = fileImportAdj(graph);
	const { dist, maxHops } = fileDistances(graph, startId, fwd);

	if (maxFileDist < 1 || maxHops < 1) {
		return projectDirectImportsOnly(graph, startId, {
			heightPx,
			maxEnds,
			weightAxis,
			units,
		});
	}

	const stagesUsed = Math.min(maxFileDist, maxHops);
	if (stagesUsed < 1) {
		return projectDirectImportsOnly(graph, startId, {
			heightPx,
			maxEnds,
			weightAxis,
			units,
		});
	}

	const rev = fileImportedByAdj(graph);
	const startLabel = basename(startId);
	const focus: AlluvialFocus = {
		kind: 'file',
		id: startId,
		label: startLabel,
	};

	const inRadius = (path: string): boolean => {
		const d = dist.get(path);
		return d !== undefined && d >= 1 && d <= stagesUsed;
	};

	// --- package edges within radius (+ start) ---
	const endMeta = new Map<string, { label: string; kind: string }>();
	/** packageKey → list of { file, w } importers in radius or start */
	const endToImporters = new Map<string, { file: string; w: number }[]>();

	for (const e of graph.edges) {
		if (e.toKind === 'file') continue;
		const from = e.from;
		const d = dist.get(from);
		if (d === undefined) continue;
		if (from !== startId && !inRadius(from)) continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const w = edgeWeight(e, graph, weightAxis);
		endMeta.set(e.to, { label, kind: e.toKind });
		const list = endToImporters.get(e.to) ?? [];
		list.push({ file: from, w });
		endToImporters.set(e.to, list);
	}

	if (!endToImporters.size) {
		return projectAlluvial(graph, startId, passOpts);
	}

	// --- files at each BFS distance ---
	const filesAtStage = new Map<number, string[]>();
	for (const [path, d] of dist) {
		if (!inRadius(path)) continue;
		const list = filesAtStage.get(d) ?? [];
		list.push(path);
		filesAtStage.set(d, list);
	}

	// Package mass per file (rank hop leaves by mass, not alpha — matches projectAlluvial)
	const filePkgMass = new Map<string, number>();
	for (const imps of endToImporters.values()) {
		for (const { file, w } of imps) {
			if (file === startId) continue;
			filePkgMass.set(file, (filePkgMass.get(file) ?? 0) + w);
		}
	}

	const fileDisplay = new Map<string, string>();
	const displayMeta = new Map<
		string,
		{ stage: number; ref: AlluvialNodeRef; category: string }
	>();

	// File leaves only (no folder stages)
	for (const [stage, files] of filesAtStage) {
		const category = hopCategory(stage);
		const ranked = [...files].sort(
			(a, b) =>
				(filePkgMass.get(b) ?? 0) - (filePkgMass.get(a) ?? 0) ||
				a.localeCompare(b),
		);
		const kept = ranked.slice(0, maxNodesPerHop);
		const keptSet = new Set(kept);
		const otherCount = ranked.length - kept.length;
		const otherName =
			otherCount > 0 ? hopNodeLabel(moreCountLabel(otherCount), stage) : '';
		const labels = uniqueFileLabels(kept);
		for (const f of files) {
			if (keptSet.has(f)) {
				const base = labels.get(f) ?? basename(f);
				const name = hopNodeLabel(base, stage);
				fileDisplay.set(f, name);
				displayMeta.set(name, {
					stage,
					ref: { kind: 'file', id: f },
					category,
				});
			} else if (otherName) {
				fileDisplay.set(f, otherName);
				displayMeta.set(otherName, {
					stage,
					ref: { kind: 'bucket', id: otherName },
					category,
				});
			}
		}
	}

	// Shared rails for package-path padding (same category as hop stage)
	for (let s = 1; s <= stagesUsed; s++) {
		const id = railId(s);
		displayMeta.set(id, {
			stage: s,
			ref: { kind: 'bucket', id },
			category: hopCategory(s),
		});
	}

	// Rank packages
	const endTotals = new Map<string, number>();
	for (const [endKey, imps] of endToImporters) {
		let n = 0;
		for (const { w } of imps) n += w;
		endTotals.set(endKey, n);
	}
	const topEnds = [...endTotals.entries()]
		.sort(
			(a, b) =>
				b[1] - a[1] ||
				(endMeta.get(a[0])?.label ?? '').localeCompare(endMeta.get(b[0])?.label ?? ''),
		)
		.slice(0, maxEnds)
		.map(([k]) => k);
	const keptEnds = new Set(topEnds);

	const linkMap = new Map<string, number>();
	const addLink = (source: string, target: string, value: number) => {
		if (value <= 0 || source === target) return;
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	/**
	 * Package → file path of length layerForDist(d) so every dist-d file sits
	 * on the same sankey layer. Uses shared hop rails as pads.
	 *
	 * Example maxFileDist=4, d=2 → layer 3:
	 *   pkg → rail_h4 → rail_h3 → file_h2
	 */
	const addPackageToFile = (
		pkgLabel: string,
		fileLabel: string,
		fileDist: number,
		mass: number,
	) => {
		const L = layerForDist(fileDist, stagesUsed);
		if (L <= 1) {
			addLink(pkgLabel, fileLabel, mass);
			return;
		}
		// Walk rails from hop stagesUsed down to fileDist+1, then into file
		let prev = pkgLabel;
		for (let stage = stagesUsed; stage > fileDist; stage--) {
			const rail = railId(stage);
			addLink(prev, rail, mass);
			prev = rail;
		}
		addLink(prev, fileLabel, mass);
	};

	// Package edges
	for (const [endKey, imps] of endToImporters) {
		const endLabel = keptEnds.has(endKey)
			? (endMeta.get(endKey)?.label ?? endKey)
			: '(other ends)';
		for (const { file, w } of imps) {
			if (file === startId || (dist.get(file) ?? 0) === 0) {
				addLink(endLabel, startLabel, w);
				continue;
			}
			const d = dist.get(file) ?? 0;
			const fileLab = fileDisplay.get(file);
			if (!fileLab || d < 1 || d > stagesUsed) {
				addLink(endLabel, startLabel, w);
				continue;
			}
			addPackageToFile(endLabel, fileLab, d, w);
		}
	}

	// File → parent (consecutive BFS only): dist d → dist d-1 or File
	// Weight = package mass on that file (direct), routed toward start.
	const fileMass = new Map<string, number>(filePkgMass);
	for (let stage = stagesUsed; stage >= 1; stage--) {
		const filesHere = filesAtStage.get(stage) ?? [];
		const ordered = [...filesHere].sort(
			(a, b) => (dist.get(b) ?? 0) - (dist.get(a) ?? 0) || a.localeCompare(b),
		);
		for (const f of ordered) {
			const m = fileMass.get(f) ?? 0;
			if (m <= 0) continue;
			const d = dist.get(f) ?? stage;
			const fromLabel = fileDisplay.get(f) ?? hopNodeLabel(basename(f), stage);

			const importers = rev.get(f) ?? [];
			let parents = importers.filter((p) => {
				const pd = dist.get(p);
				return pd !== undefined && pd < d;
			});
			const exact = parents.filter((p) => dist.get(p) === d - 1);
			if (exact.length) parents = exact;

			if (!parents.length) {
				addLink(fromLabel, startLabel, m);
				fileMass.set(f, 0);
				continue;
			}

			const base = Math.floor(m / parents.length);
			let rem = m - base * parents.length;
			for (const p of parents) {
				const share = base + (rem > 0 ? 1 : 0);
				if (rem > 0) rem -= 1;
				if (share <= 0) continue;

				if (p === startId || (dist.get(p) ?? 0) === 0) {
					addLink(fromLabel, startLabel, share);
					continue;
				}
				const pDepth = dist.get(p)!;
				if (pDepth < 1 || pDepth > stagesUsed) {
					addLink(fromLabel, startLabel, share);
					continue;
				}
				// Only consecutive distance (should be d-1 after exact filter)
				if (pDepth !== d - 1) {
					// Non-consecutive parent: jump to File to avoid cross-layer chaos
					addLink(fromLabel, startLabel, share);
					continue;
				}
				const toLabel =
					fileDisplay.get(p) ?? hopNodeLabel(basename(p), pDepth);
				addLink(fromLabel, toLabel, share);
				fileMass.set(p, (fileMass.get(p) ?? 0) + share);
			}
			fileMass.set(f, 0);
		}
	}

	for (const [f, m] of fileMass) {
		if (m <= 0 || f === startId) continue;
		const d = dist.get(f) ?? 1;
		const fromLabel = fileDisplay.get(f) ?? hopNodeLabel(basename(f), d);
		addLink(fromLabel, startLabel, m);
	}

	// --- node meta ---
	const nodeMeta = new Map<string, { category: string; color: string }>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[startLabel]: { kind: 'file', id: startId },
	};
	nodeMeta.set(startLabel, { category: 'File', color: TEAL.start });

	const hopColor = (stage: number): string => {
		const t = stage / Math.max(stagesUsed, 1);
		if (t > 0.75) return '#0f766e';
		if (t > 0.5) return '#0d9488';
		if (t > 0.25) return '#14b8a6';
		return '#2dd4bf';
	};

	// Only materialize rails that appear in links
	const usedNames = new Set<string>();
	for (const k of linkMap.keys()) {
		const [s, t] = k.split('\0') as [string, string];
		usedNames.add(s);
		usedNames.add(t);
	}

	for (const [name, meta] of displayMeta) {
		if (!usedNames.has(name)) continue;
		// Hide rail labels — zero-width name, still holds column/layer
		const isRail = name.startsWith('\u200b·rail');
		nodeMeta.set(name, {
			category: meta.category,
			color: isRail ? hopColor(meta.stage) : hopColor(meta.stage),
		});
		nodeRef[name] = meta.ref;
	}

	// Imports (packages)
	for (const name of usedNames) {
		if (nodeMeta.has(name) || name === startLabel) continue;
		// package / other ends
		if (name === '(other ends)') {
			nodeMeta.set(name, { category: 'Imports', color: TEAL.other });
			nodeRef[name] = { kind: 'bucket', id: name };
			continue;
		}
		let kind = 'package';
		let endKey = name;
		for (const [ek, info] of endMeta) {
			if (info.label === name) {
				kind = info.kind;
				endKey = ek;
				break;
			}
		}
		const color =
			kind === 'unresolved'
				? TEAL.unresolved
				: graph.packages.get(endKey)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(name, { category: 'Imports', color });
		nodeRef[name] = {
			kind: kind === 'unresolved' ? 'unresolved' : 'package',
			id: endKey,
		};
	}

	// Drop unused
	for (const name of [...nodeMeta.keys()]) {
		if (!usedNames.has(name) && name !== startLabel) nodeMeta.delete(name);
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	const hopCats: string[] = [];
	for (let s = stagesUsed; s >= 1; s--) {
		const cat = hopCategory(s);
		if ([...nodeMeta.values()].some((m) => m.category === cat)) hopCats.push(cat);
	}
	const categoryOrder = ['Imports', ...hopCats, 'File'];

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId,
		units,
		ariaLabel: `Import tree for ${startId} (viz depth ${maxDepth})`,
	});
}

/**
 * Depth 1: only packages imported directly by the start file.
 * Columns: Imports → File
 */
function projectDirectImportsOnly(
	graph: CodeGraph,
	startId: string,
	opts: {
		heightPx: number;
		maxEnds: number;
		weightAxis: WeightAxis;
		units: string;
	},
): AlluvialPayload | null {
	const startLabel = basename(startId);
	const focus: AlluvialFocus = {
		kind: 'file',
		id: startId,
		label: startLabel,
	};

	const endCounts = new Map<string, { label: string; kind: string; n: number }>();
	for (const e of graph.edges) {
		if (e.from !== startId) continue;
		if (e.toKind === 'file') continue;
		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const w = edgeWeight(e, graph, opts.weightAxis);
		const prev = endCounts.get(e.to);
		if (prev) prev.n += w;
		else endCounts.set(e.to, { label, kind: e.toKind, n: w });
	}

	if (!endCounts.size) {
		return projectAlluvial(graph, startId, {
			heightPx: opts.heightPx,
			maxEnds: opts.maxEnds,
			weightAxis: opts.weightAxis,
		});
	}

	const ranked = [...endCounts.entries()].sort(
		(a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label),
	);
	const kept = new Set(ranked.slice(0, opts.maxEnds).map(([k]) => k));
	const hasOther = ranked.some(([k]) => !kept.has(k));

	const linkMap = new Map<string, number>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[startLabel]: { kind: 'file', id: startId },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(startLabel, { category: 'File', color: TEAL.start });

	const otherLabel = '(other ends)';
	for (const [endKey, info] of endCounts) {
		const source = kept.has(endKey) ? info.label : otherLabel;
		const k = `${source}\0${startLabel}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + info.n);
		if (source === otherLabel) continue;
		nodeRef[source] = {
			kind: info.kind === 'unresolved' ? 'unresolved' : 'package',
			id: endKey,
		};
		const color =
			info.kind === 'unresolved'
				? TEAL.unresolved
				: graph.packages.get(endKey)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(source, { category: 'Imports', color });
	}
	if (hasOther) {
		nodeRef[otherLabel] = { kind: 'bucket', id: otherLabel };
		nodeMeta.set(otherLabel, { category: 'Imports', color: TEAL.other });
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildAlluvialPayload({
		heightPx: opts.heightPx,
		links,
		nodeMeta,
		categoryOrder: ['Imports', 'File'],
		focus,
		nodeRef,
		startId,
		units: opts.units,
		ariaLabel: `Direct imports for ${startId}`,
	});
}
