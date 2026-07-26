/**
 * Project CodeGraph + start → Carbon Charts alluvial payload.
 * Columns (L→R): Imports → Hop 1 (importer files) → File
 *
 * Flow unit: one observed package/unresolved import edge in the reachable set.
 * Links are conserved through intermediate file leaves.
 * Path folders are never hop stages — only file labels (or +N more).
 * Direct package imports by the start go Imports → File.
 */

import { reachableFiles } from '@core/graph/build.ts';
import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
} from '@core/graph/types.ts';
import {
	edgeWeight,
	resolveWeightAxis,
	unitsForAxis,
	type WeightAxis,
} from '@core/view/weight.ts';

export type { WeightAxis };

export const TEAL = {
	start: '#14b8a6', // teal-500
	module: '#2dd4bf', // teal-400
	package: '#0d9488', // teal-600
	builtin: '#5eead4', // teal-300
	unresolved: '#f59e0b', // amber
	other: '#71717a', // zinc-500
	/** Export / outbound hub bands — yellow complements teal importers. */
	export: '#eab308', // yellow-500
	exportPkg: '#ca8a04', // yellow-600
	exportOther: '#a16207', // yellow-700 (overflow)
};

export function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * Module-folder key for alluvial / reverse-importer grouping.
 *
 * - `config.ts` → `(root)`
 * - `lib/utils.ts` → `lib`
 * - `src/lib/email.ts` → `src/lib` (two segments when deep enough)
 * - `client/sim/foo.ts` → `client/sim` (not just `client`)
 *
 * Using two path segments for depth≥3 avoids monorepo collapse where hundreds
 * of importers under `client/` or `server/` become one useless alluvial node.
 */
export function topFolder(path: string): string {
	const parts = path.split('/').filter(Boolean);
	if (parts.length <= 1) return '(root)';
	if (parts.length >= 3) return `${parts[0]}/${parts[1]}`;
	return parts[0]!;
}

/** Collision-safe display labels for file paths (basename, or trailing segments). */
export function uniqueFileLabels(paths: string[]): Map<string, string> {
	const byBase = new Map<string, string[]>();
	for (const p of paths) {
		const b = basename(p);
		const list = byBase.get(b) ?? [];
		list.push(p);
		byBase.set(b, list);
	}
	const out = new Map<string, string>();
	for (const [base, group] of byBase) {
		if (group.length === 1) {
			out.set(group[0]!, base);
			continue;
		}
		for (const p of group) {
			const parts = p.split('/');
			out.set(p, parts.length >= 2 ? parts.slice(-2).join('/') : p);
		}
	}
	// Second pass if trailing-two still collides
	const labelCounts = new Map<string, number>();
	for (const label of out.values()) {
		labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
	}
	for (const [p, label] of out) {
		if ((labelCounts.get(label) ?? 0) > 1) out.set(p, p);
	}
	return out;
}

type EndInfo = { label: string; kind: string };

type NodeMetaEntry = { category: string; color: string };

/**
 * Overflow / aggregate label for truncated lists.
 * Example: 74 skipped call sites → `+ 74 more`
 */
export function moreCountLabel(count: number): string {
	const n = Math.max(0, Math.floor(count));
	return `+ ${n} more`;
}

/** True for aggregate buckets that should sort to the bottom of a column. */
export function isOverflowNodeName(name: string): boolean {
	if (name.startsWith('(')) return true;
	return /^\+\s*\d+\s+more$/.test(name);
}

/** Named nodes first (alpha); overflow buckets last (still alpha among themselves). */
export function compareAlluvialNodeNames(a: string, b: string): number {
	const ao = isOverflowNodeName(a) ? 1 : 0;
	const bo = isOverflowNodeName(b) ? 1 : 0;
	if (ao !== bo) return ao - bo;
	return a.localeCompare(b);
}

/**
 * Shared Carbon alluvial payload builder.
 * `categoryOrder` lists columns L→R (e.g. Ends → Modules → Code).
 */
export function buildAlluvialPayload(args: {
	heightPx: number;
	links: { source: string; target: string; value: number }[];
	nodeMeta: Map<string, NodeMetaEntry>;
	categoryOrder: string[];
	focus: AlluvialFocus;
	nodeRef: Record<string, AlluvialNodeRef>;
	startId?: string;
	units?: string;
	ariaLabel?: string;
}): AlluvialPayload | null {
	const {
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId,
		units = 'package imports',
		ariaLabel,
	} = args;
	if (!links.length) return null;

	const nodes: AlluvialPayload['options']['alluvial']['nodes'] = [];
	const nodeRank: Record<string, number> = {};

	for (const category of categoryOrder) {
		const names = [...nodeMeta.entries()]
			.filter(([, m]) => m.category === category)
			.map(([n]) => n)
			.sort(compareAlluvialNodeNames);
		let rank = 0;
		for (const n of names) {
			nodes.push({ name: n, category, rank });
			nodeRank[n] = rank++;
		}
	}

	const colorScale: Record<string, string> = {};
	for (const [name, meta] of nodeMeta) colorScale[name] = meta.color;

	return {
		data: links,
		options: {
			title: '',
			theme: 'g100',
			height: `${heightPx}px`,
			animations: false,
			toolbar: { enabled: false },
			legend: { enabled: false, clickable: false },
			accessibility: {
				svgAriaLabel:
					ariaLabel ?? `Alluvial for ${focus.label}`,
			},
			alluvial: {
				units,
				nodes,
				nodeAlignment: 'center',
			},
			color: { scale: colorScale },
			tooltip: { enabled: true },
		},
		meta: {
			...(startId !== undefined ? { startId } : {}),
			focus,
			nodeRef,
			nodeRank,
		},
	};
}

/**
 * Build alluvial from a start file. Returns null if start missing or no flow.
 *
 * Columns L→R: Imports → Hop 1 (importer files) → File
 * Path folders are never intermediate stages — only file leaves (or +N more).
 * Labels match multi-hop / hub: Imports + File (not Ends/Modules/Code).
 */
export function projectAlluvial(
	graph: CodeGraph,
	startId: string,
	opts?: {
		heightPx?: number;
		/** Max intermediate importer files (was maxModules). */
		maxModules?: number;
		maxEnds?: number;
		weightAxis?: WeightAxis;
	},
): AlluvialPayload | null {
	if (!graph.files.has(startId)) return null;

	const maxFiles = opts?.maxModules ?? 12;
	const maxEnds = opts?.maxEnds ?? 16;
	const heightPx = opts?.heightPx ?? 360;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const units = unitsForAxis(weightAxis, 'package-mass');

	const reachable = reachableFiles(graph, startId);
	const startLabel = basename(startId);
	const focus: AlluvialFocus = {
		kind: 'file',
		id: startId,
		label: startLabel,
	};

	// package/unresolved → importer file path (or '__code__' for start itself)
	const endToFile = new Map<string, Map<string, number>>();
	const endMeta = new Map<string, EndInfo>();
	const importerPaths = new Set<string>();

	const bump = (endKey: string, fileKey: string, info: EndInfo, w: number) => {
		endMeta.set(endKey, info);
		let row = endToFile.get(endKey);
		if (!row) {
			row = new Map();
			endToFile.set(endKey, row);
		}
		row.set(fileKey, (row.get(fileKey) ?? 0) + w);
	};

	for (const e of graph.edges) {
		if (!reachable.has(e.from)) continue;
		if (e.toKind === 'file') continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const info: EndInfo = { label, kind: e.toKind };
		const fileKey = e.from === startId ? '__code__' : e.from;
		if (fileKey !== '__code__') importerPaths.add(fileKey);
		bump(e.to, fileKey, info, edgeWeight(e, graph, weightAxis));
	}

	const nodeRef: Record<string, AlluvialNodeRef> = {
		[startLabel]: { kind: 'file', id: startId },
	};

	if (!endToFile.size) {
		const emptyLabel = '(no package imports)';
		nodeRef[emptyLabel] = { kind: 'bucket', id: emptyLabel };
		return buildAlluvialPayload({
			heightPx,
			links: [{ source: emptyLabel, target: startLabel, value: 1 }],
			nodeMeta: new Map([
				[startLabel, { category: 'File', color: TEAL.start }],
				[emptyLabel, { category: 'Imports', color: TEAL.other }],
			]),
			categoryOrder: ['Imports', 'File'],
			focus,
			nodeRef,
			startId,
			units,
			ariaLabel: `Imports for ${startLabel}`,
		});
	}

	const endTotals = new Map<string, number>();
	const fileTotals = new Map<string, number>();
	for (const [endKey, row] of endToFile) {
		let endSum = 0;
		for (const [fileKey, n] of row) {
			endSum += n;
			if (fileKey !== '__code__') {
				fileTotals.set(fileKey, (fileTotals.get(fileKey) ?? 0) + n);
			}
		}
		endTotals.set(endKey, endSum);
	}

	const fileLabels = uniqueFileLabels([...fileTotals.keys()]);
	const rankedFiles = [...fileTotals.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const keptFilePaths = new Set(rankedFiles.slice(0, maxFiles).map(([p]) => p));
	const hasOtherFiles = rankedFiles.some(([p]) => !keptFilePaths.has(p));
	const otherFiles = moreCountLabel(
		rankedFiles.filter(([p]) => !keptFilePaths.has(p)).length,
	);

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
		const k = `${source}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + value);
	};

	const endDisplayId = new Map<string, string>();
	const displayForFile = (path: string): string => {
		if (keptFilePaths.has(path)) return fileLabels.get(path) ?? basename(path);
		return otherFiles;
	};

	for (const [endKey, row] of endToFile) {
		const sourceLabel = keptEnds.has(endKey)
			? (endMeta.get(endKey)?.label ?? endKey)
			: '(other ends)';
		if (keptEnds.has(endKey)) endDisplayId.set(sourceLabel, endKey);

		for (const [fileKey, n] of row) {
			if (fileKey === '__code__') addLink(sourceLabel, startLabel, n);
			else addLink(sourceLabel, displayForFile(fileKey), n);
		}
	}

	// Intermediate file leaves → File (conservation)
	const fileIn = new Map<string, number>();
	for (const [k, value] of linkMap) {
		const target = k.split('\0')[1]!;
		if (target === startLabel) continue;
		fileIn.set(target, (fileIn.get(target) ?? 0) + value);
	}
	for (const [lab, n] of fileIn) {
		addLink(lab, startLabel, n);
	}

	const nodeMeta = new Map<string, NodeMetaEntry>();
	nodeMeta.set(startLabel, { category: 'File', color: TEAL.start });

	for (const [lab] of fileIn) {
		const isOther = lab === otherFiles || lab.startsWith('+');
		nodeMeta.set(lab, {
			category: 'Hop 1',
			color: isOther ? TEAL.other : TEAL.module,
		});
		if (isOther) {
			nodeRef[lab] = { kind: 'bucket', id: 'other-files' };
		} else {
			// Resolve path from label
			let path: string | undefined;
			for (const [p, l] of fileLabels) {
				if (l === lab) {
					path = p;
					break;
				}
			}
			if (path) nodeRef[lab] = { kind: 'file', id: path };
			else nodeRef[lab] = { kind: 'bucket', id: lab };
		}
	}

	const endLabelsSeen = new Set<string>();
	for (const [k] of linkMap) {
		const source = k.split('\0')[0]!;
		if (source === startLabel || fileIn.has(source)) continue;
		endLabelsSeen.add(source);
	}
	for (const label of endLabelsSeen) {
		if (label.startsWith('(')) {
			nodeMeta.set(label, { category: 'Imports', color: TEAL.other });
			nodeRef[label] = { kind: 'bucket', id: label };
			continue;
		}
		let kind = 'package';
		let endKey = endDisplayId.get(label) ?? label;
		for (const [ek, info] of endMeta) {
			if (info.label === label) {
				kind = info.kind;
				endKey = ek;
				break;
			}
		}
		const color =
			kind === 'unresolved'
				? TEAL.unresolved
				: kind === 'package' && graph.packages.get(endKey)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(label, { category: 'Imports', color });
		nodeRef[label] = {
			kind: kind === 'unresolved' ? 'unresolved' : 'package',
			id: endKey,
		};
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	const hasHop = fileIn.size > 0;
	const categoryOrder = hasHop
		? ['Imports', 'Hop 1', 'File']
		: ['Imports', 'File'];

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder,
		focus,
		nodeRef,
		startId,
		units,
		ariaLabel: `Imports for ${startLabel}`,
	});
}
