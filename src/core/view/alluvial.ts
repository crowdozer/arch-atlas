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

/**
 * Display labels for file paths — full path (unique by definition).
 * Chart polish right-truncates long paths for fit; hover keeps the full string.
 */
export function uniqueFileLabels(paths: string[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const p of paths) out.set(p, p);
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
	/** Hub pad free-source display names (see AlluvialPayload.meta.terminators). */
	terminators?: string[];
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
		terminators,
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
			tooltip: {
				enabled: true,
				// Pad rails (·in-rail·hN) must not appear in band tooltips
				customHTML: alluvialTooltipCustomHTML,
			},
		},
		meta: {
			...(startId !== undefined ? { startId } : {}),
			focus,
			nodeRef,
			nodeRank,
			...(terminators?.length ? { terminators: [...terminators] } : {}),
		},
	};
}

/** Pad-rail side: import free-source scaffolding vs export intermediate mass. */
export type AlluvialRailKind = 'in' | 'out';

/**
 * Normalize rail-ish labels (ZWSP prefix, Carbon "name (value)" suffix).
 */
export function normalizeAlluvialRailLabel(name: string): string {
	return name
		.replace(/^\u200b+/u, '')
		.replace(/\s+\([\d,.]+[kKmM]?\)$/u, '')
		.trim();
}

/**
 * Classify pad-rail node ids used for sankey layer alignment.
 * - `in`  — import free-source scaffolding (ghost bars/bands hide)
 * - `out` — export intermediate mass carriers (bands stay painted)
 * Matches ZWSP names and value-suffixed tooltip forms.
 */
export function alluvialRailKind(name: string): AlluvialRailKind | null {
	const n = normalizeAlluvialRailLabel(name);
	if (!n) return null;
	if (n.includes('·in-rail') || n.startsWith('in-rail')) return 'in';
	if (n.includes('·out-rail') || n.startsWith('out-rail')) return 'out';
	if (/^(?:·)?in-rail(?:·h\d+)?$/iu.test(n)) return 'in';
	if (/^(?:·)?out-rail(?:·h\d+)?$/iu.test(n)) return 'out';
	return null;
}

/** True for either in-rail or out-rail pad ids. */
export function isAlluvialRailName(name: string): boolean {
	return alluvialRailKind(name) !== null;
}

export function isInRailName(name: string): boolean {
	return alluvialRailKind(name) === 'in';
}

export function isOutRailName(name: string): boolean {
	return alluvialRailKind(name) === 'out';
}

/**
 * Pad bands that should be undrawn (ghost columns).
 *
 * Hub free-source reverse pads use **out-rails** (export side). Forward
 * File→deep file pads use **in-rails** and carry real mass to dual-path seeds
 * (e.g. logger at longest dist 3 while also a direct focus import) — those
 * bands must stay painted. Undraw only pure rail→rail free-source chains that
 * never touch a real file/package (legacy reverse free-source scaffold).
 *
 * Historically this matched any in-rail endpoint and erased import-side mass
 * pads, making deep dual-path files look disconnected / under External.
 */
export function isImportPadScaffoldLink(source: string, target: string): boolean {
	// Pure rail↔rail only; File/file/package endpoints keep their ribbons.
	return isInRailName(source) && isInRailName(target);
}

function linkEndsFromUnknown(
	raw: unknown,
): { source: string; target: string; value?: number } | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	// Direct link shape
	const pickName = (end: unknown): string | null => {
		if (typeof end === 'string' && end) return end;
		if (end && typeof end === 'object') {
			const n = (end as { name?: unknown }).name;
			if (typeof n === 'string' && n) return n;
		}
		return null;
	};
	let source = pickName(o.source);
	let target = pickName(o.target);
	let value = typeof o.value === 'number' ? o.value : undefined;
	if (source && target) return { source, target, value };

	// Sometimes wrapped: { datum } or array of links
	if (Array.isArray(raw) && raw.length) {
		return linkEndsFromUnknown(raw[0]);
	}
	if (o.datum) return linkEndsFromUnknown(o.datum);
	if (Array.isArray(o.data) && o.data.length) {
		return linkEndsFromUnknown(o.data[0]);
	}
	return null;
}

/**
 * Scrub pad-rail tokens from Carbon's default tooltip HTML when datum parse
 * fails but the string still mentions in-rail / out-rail.
 */
function scrubRailTokensFromDefaultHTML(defaultHTML: string): string {
	if (!defaultHTML || !/(?:in|out)-rail/i.test(defaultHTML)) return defaultHTML;
	// Prefer the Carbon value cell text; else strip tags and scan.
	const valueCell = defaultHTML.match(
		/class=["']value["'][^>]*>([^<]+)</i,
	);
	const plain = (valueCell?.[1] ?? defaultHTML.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
	// "·in-rail·h2 → file (57)" / "file → ·out-rail·h2 (3)"
	const arrow = plain.match(
		/^(.+?)\s*→\s*(.+?)(?:\s*\(([^)]*)\))?\s*$/,
	);
	if (arrow) {
		const left = arrow[1]!.trim();
		const right = arrow[2]!.trim();
		const val = (arrow[3] ?? '').trim();
		const leftRail = isAlluvialRailName(left);
		const rightRail = isAlluvialRailName(right);
		if (leftRail && rightRail) return '';
		if (leftRail) {
			const label = `→ ${escapeTooltipText(right)}${val ? ` (${escapeTooltipText(val)})` : ''}`;
			return `<ul class="multi-tooltip"><li><div class="datapoint-tooltip"><p class="value">${label}</p></div></li></ul>`;
		}
		if (rightRail) {
			const label = `${escapeTooltipText(left)} →${val ? ` (${escapeTooltipText(val)})` : ''}`;
			return `<ul class="multi-tooltip"><li><div class="datapoint-tooltip"><p class="value">${label}</p></div></li></ul>`;
		}
	}
	// Last resort: strip rail token substrings from the HTML text
	const cleaned = defaultHTML
		.replace(/\u200b?·?(?:in|out)-rail(?:·h\d+)?/giu, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/\s*→\s*→/g, ' →')
		.replace(/>\s*→/g, '>')
		.replace(/→\s*</g, '<');
	if (!cleaned.trim() || /^(?:<[^>]+>\s*)*$/.test(cleaned)) return '';
	return cleaned;
}

/**
 * Carbon alluvial tooltip: strip pad-rail endpoints so bands never show
 * `·in-rail·h2 → app/…`. Rail→rail: empty (no tooltip).
 * When datum parse fails, scrub rail tokens from defaultHTML as a fallback.
 */
export function alluvialTooltipCustomHTML(
	data: unknown,
	defaultHTML: string,
	datum: unknown,
): string {
	const ends =
		linkEndsFromUnknown(datum) ??
		linkEndsFromUnknown(data);
	if (!ends) return scrubRailTokensFromDefaultHTML(defaultHTML);

	const sRail = isAlluvialRailName(ends.source);
	const tRail = isAlluvialRailName(ends.target);
	if (sRail && tRail) return '';

	const unitsMatch = defaultHTML.match(/\(([^)]*)\)\s*<\/| \(([^)]+)\)/);
	// Prefer rewriting when a rail is involved
	if (!sRail && !tRail) return defaultHTML;

	const real = sRail ? ends.target : ends.source;
	const val =
		ends.value !== undefined
			? String(ends.value)
			: (unitsMatch?.[1] ?? unitsMatch?.[2] ?? '').trim();
	// Minimal Carbon-like markup
	const label = sRail
		? `→ ${escapeTooltipText(real)}${val ? ` (${escapeTooltipText(val)})` : ''}`
		: `${escapeTooltipText(real)} →${val ? ` (${escapeTooltipText(val)})` : ''}`;
	return `<ul class="multi-tooltip"><li><div class="datapoint-tooltip"><p class="value">${label}</p></div></li></ul>`;
}

function escapeTooltipText(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
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
	const startLabel = startId;
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
