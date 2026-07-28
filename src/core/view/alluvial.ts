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
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
import {
	edgeWeight,
	fileLineCount,
	pickEdgeWeightOpts,
	resolveWeightAxis,
	unitsForAxis,
	type LocPrecision,
	type WeightAxis,
} from '@core/view/weight.ts';

export type { WeightAxis, LocPrecision };

/** Chart scale colors — owned by `chartPalette.ts` (must match carbon-theme). */
export { CHART_PALETTE, TEAL } from '@core/view/chartPalette.ts';
import { TEAL } from '@core/view/chartPalette.ts';

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

/**
 * In-column band stack order (global mode for all columns).
 *
 * - `flow` — **thickest leaving ribbon first**: max outbound link value (source).
 *   Pure sinks (no out) share mass 0 → name among themselves; overflow still last.
 * - `flow-target` — **thickest incoming ribbon first**: max inbound link value
 *   (target). Pure free sources (no in) → name among zeros.
 * - `node` — whole-file LOC (Estimate); packages/buckets 0
 * - `name` — alpha
 *
 * Product intent: within a column, bands that leave (flow) or enter (flow-target)
 * stack thick→thin top→bottom. Uses **max single-link width** so order tracks the
 * fat ribbon you hover, not sum of all edges (which jumps when multi-edge).
 */
export type BandSortMode = 'name' | 'flow' | 'flow-target' | 'node';

/**
 * Flow mass: max **outbound** link value per node (thickest band leaving).
 * Skips pure rail↔rail; excludes rail node names as keys.
 */
export function flowBandMass(
	links: readonly { source: string; target: string; value: number }[],
): Map<string, number> {
	const mass = new Map<string, number>();
	for (const l of links) {
		if (isAlluvialRailName(l.source) && isAlluvialRailName(l.target)) continue;
		const v = l.value;
		if (!(v > 0)) continue;
		if (isAlluvialRailName(l.source)) continue;
		const prev = mass.get(l.source) ?? 0;
		if (v > prev) mass.set(l.source, v);
	}
	return mass;
}

/**
 * Flow-target mass: max **inbound** link value per node (thickest band arriving).
 * Skips pure rail↔rail; excludes rail node names as keys.
 */
export function flowTargetBandMass(
	links: readonly { source: string; target: string; value: number }[],
): Map<string, number> {
	const mass = new Map<string, number>();
	for (const l of links) {
		if (isAlluvialRailName(l.source) && isAlluvialRailName(l.target)) continue;
		const v = l.value;
		if (!(v > 0)) continue;
		if (isAlluvialRailName(l.target)) continue;
		const prev = mass.get(l.target) ?? 0;
		if (v > prev) mass.set(l.target, v);
	}
	return mass;
}

/**
 * @deprecated Double-counts in+out. Prefer {@link flowBandMass} / {@link flowTargetBandMass}.
 */
export function incidentBandMass(
	links: readonly { source: string; target: string; value: number }[],
): Map<string, number> {
	const mass = new Map<string, number>();
	for (const l of links) {
		if (isAlluvialRailName(l.source) && isAlluvialRailName(l.target)) continue;
		const v = l.value;
		if (!(v > 0)) continue;
		mass.set(l.source, (mass.get(l.source) ?? 0) + v);
		mass.set(l.target, (mass.get(l.target) ?? 0) + v);
	}
	return mass;
}

/**
 * Node self-mass: whole-file LOC for file refs (`graph.contents`).
 * Packages / modules / buckets → 0 (no file body). Estimate LOC only — not Exact
 * export-surface (that would need a surface provider; honesty stays with Weight).
 */
export function nodeBandMass(
	names: Iterable<string>,
	nodeRef: Record<string, AlluvialNodeRef>,
	graph: CodeGraph | null | undefined,
): Map<string, number> {
	const mass = new Map<string, number>();
	if (!graph) return mass;
	for (const name of names) {
		if (isOverflowNodeName(name) || isAlluvialRailName(name)) continue;
		const ref = nodeRef[name];
		if (ref?.kind === 'file' && ref.id) {
			mass.set(name, fileLineCount(graph, ref.id));
		} else {
			mass.set(name, 0);
		}
	}
	return mass;
}

/**
 * Mode-aware in-column compare. Tiers (all modes):
 * 1. Overflow last
 * 2. Pad rails after real (non-overflow) nodes
 * 3. Mode key (name alpha / flow·flow-target·node desc)
 * 4. Stable name; numeric modes key multi-instance on nodeRef.id then label
 */
export function compareAlluvialBands(
	a: string,
	b: string,
	ctx: {
		mode: BandSortMode;
		mass: Map<string, number>;
		nodeRef: Record<string, AlluvialNodeRef>;
	},
): number {
	const ao = isOverflowNodeName(a) ? 1 : 0;
	const bo = isOverflowNodeName(b) ? 1 : 0;
	if (ao !== bo) return ao - bo;

	// Both overflow: alpha among themselves
	if (ao === 1) return a.localeCompare(b);

	const ar = isAlluvialRailName(a) ? 1 : 0;
	const br = isAlluvialRailName(b) ? 1 : 0;
	if (ar !== br) return ar - br;
	// Both rails: pin by name (do not apply user mass to ZWSP rails)
	if (ar === 1) return a.localeCompare(b);

	if (
		ctx.mode === 'flow' ||
		ctx.mode === 'flow-target' ||
		ctx.mode === 'node'
	) {
		const ma = ctx.mass.get(a) ?? 0;
		const mb = ctx.mass.get(b) ?? 0;
		if (ma !== mb) return mb - ma;
		// multi-instance: same path id may share mass shape; still break on label
		const idA = ctx.nodeRef[a]?.id;
		const idB = ctx.nodeRef[b]?.id;
		if (idA && idB && idA !== idB) return idA.localeCompare(idB);
		return a.localeCompare(b);
	}

	// name
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
	/** In-column band order; default flow (overflow last, rails after real). */
	bandSort?: BandSortMode;
	/**
	 * Needed for `bandSort: 'node'` (file LOC). Optional — without it node mode
	 * ranks files as 0 (name tie-break only).
	 */
	graph?: CodeGraph | null;
	/** Reverse free-source pad targets (meta.terminators). */
	terminators?: string[];
	/** Forward true leaves on Imports / External (meta.exportTerminators). */
	exportTerminators?: string[];
	/**
	 * Hub External straighten identity: parent → package widths from residual
	 * allocation (meta.externalStraightPairs).
	 */
	externalStraightPairs?: {
		parent: string;
		packageName: string;
		width: number;
	}[];
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
		bandSort = 'flow',
		graph = null,
		terminators,
		exportTerminators,
		externalStraightPairs,
	} = args;
	if (!links.length) return null;

	const nodes: AlluvialPayload['options']['alluvial']['nodes'] = [];
	const nodeRank: Record<string, number> = {};
	const mass =
		bandSort === 'flow'
			? flowBandMass(links)
			: bandSort === 'flow-target'
				? flowTargetBandMass(links)
				: bandSort === 'node'
					? nodeBandMass(nodeMeta.keys(), nodeRef, graph)
					: new Map<string, number>();
	const sortCtx = {
		mode: bandSort,
		mass,
		nodeRef,
	};

	for (const category of categoryOrder) {
		const names = [...nodeMeta.entries()]
			.filter(([, m]) => m.category === category)
			.map(([n]) => n)
			.sort((a, b) => compareAlluvialBands(a, b, sortCtx));
		let rank = 0;
		for (const n of names) {
			nodes.push({ name: n, category, rank });
			nodeRank[n] = rank++;
		}
	}

	const colorScale: Record<string, string> = {};
	for (const [name, meta] of nodeMeta) colorScale[name] = meta.color;

	// Label polish needs LOC for every file band, independent of bandSort mode.
	const labelLocMass = nodeBandMass(nodeMeta.keys(), nodeRef, graph);
	const labelLoc: Record<string, number> = {};
	for (const [name, loc] of labelLocMass) {
		if (loc > 0) labelLoc[name] = loc;
	}

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
				// Carbon: only left|right override; default is justify which pushes
				// leaf nodes (e.g. logger with no hub outs) to the rightmost column
				// under External. left keeps depth = column (hub law).
				nodeAlignment: 'left',
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
			bandSort,
			...(Object.keys(labelLoc).length ? { labelLoc } : {}),
			...(terminators?.length ? { terminators: [...terminators] } : {}),
			...(exportTerminators?.length
				? { exportTerminators: [...exportTerminators] }
				: {}),
			...(externalStraightPairs?.length
				? {
						externalStraightPairs: externalStraightPairs.map((p) => ({
							parent: p.parent,
							packageName: p.packageName,
							width: p.width,
						})),
					}
				: {}),
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
 * - Pure rail↔rail (in or out)
 * - **External package hop pads**: parent → in-rail → External (topology only;
 *   polish redraws a straight parent→package band)
 * - **Reverse free-source pads**: any **out-rail** endpoint (hub only uses
 *   out-rails for reverse free-source column alignment → undraw past/into
 *   export-side terminators)
 *
 * Real file↔file / File→seed bands stay painted.
 */
export function isImportPadScaffoldLink(
	source: string,
	target: string,
	meta?: { sourceCategory?: string; targetCategory?: string },
): boolean {
	// Pure rail↔rail (either rail family)
	if (isAlluvialRailName(source) && isAlluvialRailName(target)) return true;
	// Reverse free-source scaffold (out-rail only role on tip)
	if (isOutRailName(source) || isOutRailName(target)) return true;
	// parent → in-rail (package External hop)
	if (isInRailName(target)) return true;
	// in-rail → External package/bucket
	if (
		isInRailName(source) &&
		(meta?.targetCategory === 'External' ||
			meta?.targetCategory === EXTERNAL_IMPORT_CATEGORY_SAFE)
	) {
		return true;
	}
	return false;
}

/**
 * Local alias so alluvial.ts does not import fileHub (cycle risk).
 * Must match {@link EXTERNAL_IMPORT_CATEGORY} in fileHub (`External`).
 */
const EXTERNAL_IMPORT_CATEGORY_SAFE = 'External';

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
		precision?: LocPrecision;
		surface?: ImportedSurfaceProvider | null;
		bandSort?: BandSortMode;
	},
): AlluvialPayload | null {
	if (!graph.files.has(startId)) return null;

	const maxFiles = opts?.maxModules ?? 12;
	const maxEnds = opts?.maxEnds ?? 16;
	const heightPx = opts?.heightPx ?? 360;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const edgeWeightOpts = pickEdgeWeightOpts(opts);
	const units = unitsForAxis(weightAxis, 'package-mass', opts?.precision);

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
		bump(e.to, fileKey, info, edgeWeight(e, graph, weightAxis, edgeWeightOpts));
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
			bandSort: opts?.bandSort,
			graph,
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
		bandSort: opts?.bandSort,
		graph,
	});
}
