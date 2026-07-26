/**
 * Multi-hop alluvial: deepest outbound import tree as staged columns.
 * Columns L→R: Ends → Hop N → … → Hop 1 → Code
 *
 * Unit = one package/unresolved edge in the reachable set.
 * Package mass is attributed at the importer's hop depth, then routed
 * hop-by-hop toward the start along reverse file-import edges (conserved).
 *
 * Display stages collapse BFS depths deeper than maxHopStages into the
 * outermost column. Links never stay inside one stage (that would make
 * d3-sankey invent extra columns with duplicate headers like "Hop 1, Hop 1").
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
const DEFAULT_MAX_HOP_STAGES = 5;

/**
 * Map raw BFS depth (d≥1) to a display stage in 1..maxStages.
 * Depths deeper than maxStages collapse into the outermost stage.
 */
export function stageForDepth(depth: number, maxStages: number): number {
	if (depth < 1) return 0;
	if (maxStages < 1) return 0;
	if (depth <= maxStages) return depth;
	return maxStages;
}

/**
 * Column header for a display stage.
 * Only the outermost stage uses "Hop ≥N", and only when the real graph is deeper.
 */
export function hopCategory(
	stage: number,
	stagesUsed: number,
	maxHops: number,
): string {
	if (stage < 1) return 'Hop 0';
	if (stage === stagesUsed && maxHops > stagesUsed) {
		return `Hop ≥${stage}`;
	}
	return `Hop ${stage}`;
}

function hopNodeLabel(folderOrFile: string, stage: number): string {
	// Disambiguate same folder/file across stages
	return `${folderOrFile} · h${stage}`;
}

/**
 * Multi-hop dependency tree alluvial for a start file.
 * Falls back to 3-column projectAlluvial when maxHops < 2.
 *
 * @param opts.maxHopStages Viz-only cap on hop columns (scan/index unbounded).
 */
export function projectMultiHopAlluvial(
	graph: CodeGraph,
	startId: string,
	opts?: {
		heightPx?: number;
		maxHopStages?: number;
		maxEnds?: number;
		maxNodesPerHop?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(startId)) return null;

	const heightPx = opts?.heightPx ?? 360;
	const maxHopStages = Math.max(1, opts?.maxHopStages ?? DEFAULT_MAX_HOP_STAGES);
	const maxEnds = opts?.maxEnds ?? 16;
	const maxNodesPerHop = opts?.maxNodesPerHop ?? 12;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'package-mass');
	const passOpts = { heightPx, maxEnds, weightAxis };

	const fwd = fileImportAdj(graph);
	const { dist, maxHops } = fileDistances(graph, startId, fwd);

	if (maxHops < 2) {
		return projectAlluvial(graph, startId, passOpts);
	}

	// How many hop columns we actually draw (never more than the graph has)
	const stagesUsed = Math.min(maxHops, maxHopStages);
	const rev = fileImportedByAdj(graph);
	const startLabel = basename(startId);
	const focus: AlluvialFocus = {
		kind: 'file',
		id: startId,
		label: startLabel,
	};

	// --- package mass per file ---
	const filePkgMass = new Map<string, number>();
	const endMeta = new Map<string, { label: string; kind: string }>();
	const endToFile = new Map<string, Map<string, number>>(); // end → file → mass

	for (const e of graph.edges) {
		if (!dist.has(e.from)) continue;
		if (e.toKind === 'file') continue;
		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const w = edgeWeight(e, graph, weightAxis);
		endMeta.set(e.to, { label, kind: e.toKind });
		filePkgMass.set(e.from, (filePkgMass.get(e.from) ?? 0) + w);
		let row = endToFile.get(e.to);
		if (!row) {
			row = new Map();
			endToFile.set(e.to, row);
		}
		row.set(e.from, (row.get(e.from) ?? 0) + w);
	}

	if (!endToFile.size) {
		return projectAlluvial(graph, startId, passOpts);
	}

	// --- files at each display stage ---
	const filesAtStage = new Map<number, string[]>();
	for (const [path, d] of dist) {
		if (path === startId || d < 1) continue;
		const s = stageForDepth(d, stagesUsed);
		const list = filesAtStage.get(s) ?? [];
		list.push(path);
		filesAtStage.set(s, list);
	}

	/** file path → display node name at its stage */
	const fileDisplay = new Map<string, string>();
	/** display name → nodeRef + stage */
	const displayMeta = new Map<
		string,
		{ stage: number; ref: AlluvialNodeRef; category: string }
	>();

	for (const [stage, files] of filesAtStage) {
		const category = hopCategory(stage, stagesUsed, maxHops);
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

	// --- rank ends ---
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
		if (value <= 0) return;
		// Never draw same-node self-loops
		if (source === target) return;
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	// Package → hop node (or code). Always to the file's display stage.
	for (const [endKey, row] of endToFile) {
		const endLabel = keptEnds.has(endKey)
			? (endMeta.get(endKey)?.label ?? endKey)
			: '(other ends)';
		for (const [file, n] of row) {
			const d = dist.get(file) ?? 0;
			if (d === 0 || file === startId) {
				addLink(endLabel, startLabel, n);
			} else {
				const target = fileDisplay.get(file);
				if (target) addLink(endLabel, target, n);
				else addLink(endLabel, startLabel, n);
			}
		}
	}

	// Route mass hop-by-hop toward start in file space, but only **emit**
	// alluvial edges that cross a display-stage boundary (or go to Code).
	// Same-stage parent hops only transfer fileMass (no link) so Carbon/d3
	// cannot invent a second column with the same "Hop N" header.
	const fileMass = new Map<string, number>(filePkgMass);

	for (let stage = stagesUsed; stage >= 1; stage--) {
		const filesHere = filesAtStage.get(stage) ?? [];
		// Within a collapsed stage, process deep files first so mass bubbles
		// to shallower same-stage parents before we leave the stage.
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
			const fromStage = stage;

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
				const pStage = stageForDepth(pDepth, stagesUsed);
				const toLabel =
					fileDisplay.get(p) ?? hopNodeLabel(basename(p), pStage);

				if (pStage < fromStage) {
					// Cross stage boundary → real hop column edge
					addLink(fromLabel, toLabel, share);
					fileMass.set(p, (fileMass.get(p) ?? 0) + share);
				} else {
					// Same display stage (collapsed deep chain): absorb mass only
					fileMass.set(p, (fileMass.get(p) ?? 0) + share);
				}
			}
			fileMass.set(f, 0);
		}
	}

	// Residual mass on non-start files → code
	for (const [f, m] of fileMass) {
		if (m <= 0 || f === startId) continue;
		const d = dist.get(f) ?? 1;
		const s = stageForDepth(d, stagesUsed);
		const fromLabel = fileDisplay.get(f) ?? hopNodeLabel(basename(f), s);
		addLink(fromLabel, startLabel, m);
	}

	// --- node meta ---
	const nodeMeta = new Map<string, { category: string; color: string }>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[startLabel]: { kind: 'file', id: startId },
	};
	nodeMeta.set(startLabel, { category: 'Code', color: TEAL.start });

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
			nodeMeta.set(label, { category: 'Ends', color: TEAL.other });
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
		nodeMeta.set(label, { category: 'Ends', color });
	}

	// Drop nodes with no links
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

	// Category order: only hop stages that still have nodes (avoid empty headers)
	const hopCatsPresent = new Set<string>();
	for (const meta of nodeMeta.values()) {
		if (meta.category.startsWith('Hop')) hopCatsPresent.add(meta.category);
	}
	const hopCats: string[] = [];
	for (let s = stagesUsed; s >= 1; s--) {
		const cat = hopCategory(s, stagesUsed, maxHops);
		if (hopCatsPresent.has(cat)) hopCats.push(cat);
	}
	const categoryOrder = ['Ends', ...hopCats, 'Code'];

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId,
		units,
		ariaLabel: `Multi-hop dependency tree for ${startId} (${maxHops} hops, viz depth ${stagesUsed})`,
	});
}
