/**
 * Multi-hop alluvial: outbound import tree as staged columns.
 *
 * Columns L→R: Imports → Hop N → … → Hop 1 → File
 *
 * **Depth (viz-only)** = how many hops to walk from the start file.
 * Indexing/scan stays unbounded; depth only filters this projection.
 *
 * | Depth | Meaning                                      | Columns              |
 * | ----- | -------------------------------------------- | -------------------- |
 * | 1     | Start only — packages the file imports       | Imports → File       |
 * | 2     | + distance-1 files                           | Imports → Hop 1 → File |
 * | 3     | + distance-2 files                           | Imports → Hop 2 → Hop 1 → File |
 *
 * maxFileDist = depth - 1 (intermediate file hops).
 * Package mass from files within that radius routes hop-by-hop to File.
 * Links never stay inside one hop stage (avoids duplicate Carbon headers).
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
	projectAlluvial,
	TEAL,
	topFolder,
	uniqueFileLabels,
	type WeightAxis,
} from '@core/view/alluvial.ts';
import {
	edgeWeight,
	resolveWeightAxis,
	unitsForAxis,
} from '@core/view/weight.ts';

const FILE_PROMOTE_THRESHOLD = 12;
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
 * Kept for tests / callers; with the hard BFS cap, stage === depth.
 */
export function stageForDepth(depth: number, maxFileDist: number): number {
	if (depth < 1 || maxFileDist < 1) return 0;
	if (depth <= maxFileDist) return depth;
	return 0; // outside viz radius — excluded
}

/** Column header for hop distance d (closest to File is Hop 1). */
export function hopCategory(stage: number): string {
	return `Hop ${stage}`;
}

function hopNodeLabel(folderOrFile: string, stage: number): string {
	return `${folderOrFile} · h${stage}`;
}

/**
 * Multi-hop dependency tree alluvial for a start file.
 *
 * @param opts.maxHopStages Viz depth (same as UI Depth). Alias: maxDepth.
 *   Depth 1 = Imports → File only. Does not affect indexing.
 */
export function projectMultiHopAlluvial(
	graph: CodeGraph,
	startId: string,
	opts?: {
		heightPx?: number;
		/** Viz depth: 1 = start packages only; 2+ adds Hop columns. */
		maxHopStages?: number;
		/** Same as maxHopStages (preferred name). */
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

	// No intermediate file hops requested, or tree has no outbound depth
	if (maxFileDist < 1 || maxHops < 1) {
		return projectDirectImportsOnly(graph, startId, {
			heightPx,
			maxEnds,
			weightAxis,
			units,
		});
	}

	// Fall back to classic 3-col when there is nothing multi-hop to show
	if (maxHops < 2 && maxFileDist >= 1) {
		// Still show hop 1 if depth ≥ 2 and maxHops === 1
	}

	const rev = fileImportedByAdj(graph);
	const startLabel = basename(startId);
	const focus: AlluvialFocus = {
		kind: 'file',
		id: startId,
		label: startLabel,
	};

	// Files inside the viz radius (dist 1..maxFileDist)
	const inRadius = (path: string): boolean => {
		const d = dist.get(path);
		return d !== undefined && d >= 1 && d <= maxFileDist;
	};

	// Package mass only from start + files within radius
	const filePkgMass = new Map<string, number>();
	const endMeta = new Map<string, { label: string; kind: string }>();
	const endToFile = new Map<string, Map<string, number>>();

	for (const e of graph.edges) {
		if (e.toKind === 'file') continue;
		const from = e.from;
		const d = dist.get(from);
		if (d === undefined) continue;
		if (from !== startId && (d < 1 || d > maxFileDist)) continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const w = edgeWeight(e, graph, weightAxis);
		endMeta.set(e.to, { label, kind: e.toKind });
		filePkgMass.set(from, (filePkgMass.get(from) ?? 0) + w);
		let row = endToFile.get(e.to);
		if (!row) {
			row = new Map();
			endToFile.set(e.to, row);
		}
		row.set(from, (row.get(from) ?? 0) + w);
	}

	if (!endToFile.size) {
		return projectAlluvial(graph, startId, passOpts);
	}

	// Stages that actually have files (≤ maxFileDist and ≤ graph maxHops)
	const stagesUsed = Math.min(maxFileDist, maxHops);
	if (stagesUsed < 1) {
		return projectDirectImportsOnly(graph, startId, {
			heightPx,
			maxEnds,
			weightAxis,
			units,
		});
	}

	const filesAtStage = new Map<number, string[]>();
	for (const [path, d] of dist) {
		if (!inRadius(path)) continue;
		const list = filesAtStage.get(d) ?? [];
		list.push(path);
		filesAtStage.set(d, list);
	}

	const fileDisplay = new Map<string, string>();
	const displayMeta = new Map<
		string,
		{ stage: number; ref: AlluvialNodeRef; category: string }
	>();

	for (const [stage, files] of filesAtStage) {
		const category = hopCategory(stage);
		const useFiles = files.length <= FILE_PROMOTE_THRESHOLD;
		if (useFiles) {
			const labels = uniqueFileLabels(files);
			for (const f of files) {
				const base = labels.get(f) ?? basename(f);
				const name = hopNodeLabel(base, stage);
				fileDisplay.set(f, name);
				displayMeta.set(name, {
					stage,
					ref: { kind: 'file', id: f },
					category,
				});
			}
		} else {
			const byMod = new Map<string, string[]>();
			for (const f of files) {
				const m = topFolder(f);
				const list = byMod.get(m) ?? [];
				list.push(f);
				byMod.set(m, list);
			}
			const ranked = [...byMod.entries()].sort(
				(a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
			);
			const kept = new Set(ranked.slice(0, maxNodesPerHop).map(([k]) => k));
			const otherName = hopNodeLabel('(other)', stage);
			for (const f of files) {
				const m = topFolder(f);
				if (kept.has(m)) {
					const name = hopNodeLabel(m, stage);
					fileDisplay.set(f, name);
					displayMeta.set(name, {
						stage,
						ref: { kind: 'module', id: m },
						category,
					});
				} else {
					fileDisplay.set(f, otherName);
					displayMeta.set(otherName, {
						stage,
						ref: { kind: 'bucket', id: otherName },
						category,
					});
				}
			}
		}
	}

	const endTotals = new Map<string, number>();
	for (const [endKey, row] of endToFile) {
		let n = 0;
		for (const c of row.values()) n += c;
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

	// Package → hop node at the file's distance, or File if package is on start
	for (const [endKey, row] of endToFile) {
		const endLabel = keptEnds.has(endKey)
			? (endMeta.get(endKey)?.label ?? endKey)
			: '(other ends)';
		for (const [file, n] of row) {
			if (file === startId || (dist.get(file) ?? 0) === 0) {
				addLink(endLabel, startLabel, n);
			} else {
				const target = fileDisplay.get(file);
				if (target) addLink(endLabel, target, n);
				else addLink(endLabel, startLabel, n);
			}
		}
	}

	// Route mass toward start; only emit edges that cross to a lower distance
	const fileMass = new Map<string, number>(filePkgMass);
	// Don't route start's own package mass through hops
	fileMass.delete(startId);

	for (let stage = stagesUsed; stage >= 1; stage--) {
		const filesHere = filesAtStage.get(stage) ?? [];
		const ordered = [...filesHere].sort(
			(a, b) => (dist.get(b) ?? 0) - (dist.get(a) ?? 0) || a.localeCompare(b),
		);

		for (const f of ordered) {
			const m = fileMass.get(f) ?? 0;
			if (m <= 0) continue;

			const d = dist.get(f) ?? stage;
			const importers = rev.get(f) ?? [];
			let parents = importers.filter((p) => {
				const pd = dist.get(p);
				return pd !== undefined && pd < d;
			});
			const exact = parents.filter((p) => dist.get(p) === d - 1);
			if (exact.length) parents = exact;

			const fromLabel = fileDisplay.get(f) ?? hopNodeLabel(basename(f), stage);

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
				// Parent outside viz radius → jump to File
				if (pDepth > maxFileDist || pDepth < 1) {
					addLink(fromLabel, startLabel, share);
					continue;
				}

				const toLabel =
					fileDisplay.get(p) ?? hopNodeLabel(basename(p), pDepth);

				if (pDepth < d) {
					addLink(fromLabel, toLabel, share);
					fileMass.set(p, (fileMass.get(p) ?? 0) + share);
				} else {
					fileMass.set(p, (fileMass.get(p) ?? 0) + share);
				}
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

	for (const [name, meta] of displayMeta) {
		nodeMeta.set(name, { category: meta.category, color: hopColor(meta.stage) });
		nodeRef[name] = meta.ref;
	}

	const endLabelsInLinks = new Set<string>();
	for (const k of linkMap.keys()) {
		const src = k.split('\0')[0]!;
		if (src === startLabel) continue;
		if (displayMeta.has(src)) continue;
		endLabelsInLinks.add(src);
	}
	for (const label of endLabelsInLinks) {
		let kind = 'package';
		if (label === '(other ends)') {
			nodeRef[label] = { kind: 'bucket', id: label };
			nodeMeta.set(label, { category: 'Imports', color: TEAL.other });
			continue;
		}
		for (const [endKey, info] of endMeta) {
			if (info.label === label) {
				kind = info.kind;
				nodeRef[label] = {
					kind: kind === 'unresolved' ? 'unresolved' : 'package',
					id: endKey,
				};
				break;
			}
		}
		const color =
			kind === 'unresolved'
				? TEAL.unresolved
				: graph.packages.get(label)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(label, { category: 'Imports', color });
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

	// Hop headers deep → shallow: Hop N … Hop 1
	const hopCats: string[] = [];
	for (let s = stagesUsed; s >= 1; s--) {
		const cat = hopCategory(s);
		if ([...nodeMeta.values()].some((m) => m.category === cat)) {
			hopCats.push(cat);
		}
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
		// No direct package imports — fall back to empty/placeholder alluvial
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
