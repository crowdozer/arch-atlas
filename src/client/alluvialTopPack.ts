/**
 * Post-process Carbon alluvial SVG after mount:
 * 1. Center hub File spine when both sides have edges (asymmetric hops).
 * 2. Right-truncate long node labels (full paths stay in title / aria).
 * 3. Highlight File column (spine bar + header) and inject Carbon document icon.
 * 4. Recolor File→Exports bands (Carbon paints stroke from source).
 *
 * Column vertical packing is left to Carbon/d3-sankey.
 * Label edge clearance is CSS padding on the chart holder (see carbon-theme).
 */

import { toString } from '@carbon/icon-helpers';
import Document16 from '@carbon/icons/es/document/16.js';
import {
	isAlluvialRailName,
	isImportPadScaffoldLink,
	isInRailName,
} from '@core/view/alluvial.ts';

/** Max visible characters for node name (value suffix kept). Right end wins. */
export const ALLUVIAL_LABEL_MAX_CHARS = 36;

/**
 * Purple selection accent for File spine (active focus).
 * Keep in sync with --atlas-select-strong in carbon-theme.css.
 */
const FILE_SPINE_SELECT = '#a78bfa';

type IconDescriptor = {
	elem?: string;
	attrs?: Record<string, string | number | undefined>;
	content?: IconDescriptor[];
	name?: string;
	size?: number;
};

let cachedFileIconSvg: string | null = null;
function fileHeaderIconSvg(): string {
	if (!cachedFileIconSvg) {
		cachedFileIconSvg = toString(Document16 as IconDescriptor);
	}
	return cachedFileIconSvg;
}

type SankeyLink = {
	y0: number;
	y1: number;
	width: number;
	source: SankeyNode;
	target: SankeyNode;
};

type SankeyNode = {
	name?: string;
	category?: string;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	sourceLinks?: SankeyLink[];
	targetLinks?: SankeyLink[];
};

type NodeEl = {
	el: SVGGElement;
	d: SankeyNode;
};

function readData<T>(el: Element): T | null {
	const raw = (el as unknown as { __data__?: T }).__data__;
	return raw ?? null;
}

function horizontalLinkPath(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): string {
	const mx = (x0 + x1) / 2;
	return `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
}

/**
 * Recompute each link's endpoint y from its node edges (d3-sankey order).
 */
export function recomputeLinkBreadths(nodes: SankeyNode[]): void {
	for (const node of nodes) {
		let y = node.y0;
		for (const link of node.sourceLinks ?? []) {
			link.y0 = y + link.width / 2;
			y += link.width;
		}
		y = node.y0;
		for (const link of node.targetLinks ?? []) {
			link.y1 = y + link.width / 2;
			y += link.width;
		}
	}
}

/**
 * Hub spine: File node with both inbound (imports) and outbound (exports).
 */
export function isHubFileSpine(n: SankeyNode): boolean {
	if (n.category !== 'File') return false;
	const inn = n.targetLinks?.length ?? 0;
	const out = n.sourceLinks?.length ?? 0;
	return inn > 0 && out > 0;
}

/**
 * Vertically center hub File node(s) in the y-extent of the other columns.
 * Keeps the spine mid-chart when import hops (left) and export bands (right)
 * are asymmetric in count or mass.
 *
 * Mutates nodes in place. Returns |dy| applied (0 if no-op).
 */
export function centerHubFileSpine(nodes: SankeyNode[]): number {
	const spines = nodes.filter(isHubFileSpine);
	if (!spines.length) return 0;

	const others = nodes.filter((n) => !isHubFileSpine(n));
	if (!others.length) return 0;

	const yMin = Math.min(...others.map((n) => n.y0));
	const yMax = Math.max(...others.map((n) => n.y1));
	if (!(yMax > yMin)) return 0;

	const mid = (yMin + yMax) / 2;
	let moved = 0;

	for (const spine of spines) {
		const h = spine.y1 - spine.y0;
		const desiredY0 = mid - h / 2;
		const dy = desiredY0 - spine.y0;
		if (Math.abs(dy) < 0.5) continue;
		spine.y0 += dy;
		spine.y1 += dy;
		moved += Math.abs(dy);
	}

	if (moved > 0) recomputeLinkBreadths(nodes);
	return moved;
}

function collectBoundNodes(holder: HTMLElement): NodeEl[] {
	const nodeEls = [...holder.querySelectorAll<SVGGElement>('g.node-group')];
	const bound: NodeEl[] = [];
	for (const el of nodeEls) {
		const d = readData<SankeyNode>(el);
		if (!d || typeof d.x0 !== 'number' || typeof d.y0 !== 'number') continue;
		bound.push({ el, d });
	}
	return bound;
}

function writeNodeTransformsAndLinks(holder: HTMLElement, bound: NodeEl[]): void {
	for (const { el, d } of bound) {
		el.setAttribute('transform', `translate(${d.x0}, ${d.y0})`);
	}

	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<SankeyLink>(path);
		if (!link?.source || !link?.target) continue;
		if (typeof link.y0 !== 'number' || typeof link.y1 !== 'number') continue;
		path.setAttribute(
			'd',
			horizontalLinkPath(link.source.x1, link.y0, link.target.x0, link.y1),
		);
	}
}

/**
 * Keep the right end of a label (paths show basename side); prefix ellipsis.
 * Pure string helper — used for SVG text polish after Carbon paints full names.
 */
export function rightTruncateLabel(text: string, maxChars: number): string {
	const max = Math.max(2, Math.floor(maxChars));
	if (text.length <= max) return text;
	return `…${text.slice(-(max - 1))}`;
}

/**
 * Carbon paints `name (value)`. Truncate only the name; keep the mass suffix.
 * Full original string goes on title + aria-label for hover/a11y.
 */
/** Prefer {@link isInRailName} — import free-source pad labels. */
export function isImportRailLabel(name: string): boolean {
	return isInRailName(name);
}

/** Construction-time parent→package identity for External straighten + undraw. */
export type ExternalStraightPair = {
	parent: string;
	packageName: string;
	width: number;
};

/**
 * True when `(source, target)` is a construction pair parent→package.
 * Used so direct deepest-hop attaches (no rail) undraw before straighten paints
 * the single straight ribbon.
 */
export function isExternalStraightPairLink(
	source: string,
	target: string,
	pairs: readonly Pick<ExternalStraightPair, 'parent' | 'packageName'>[],
): boolean {
	if (!source || !target || !pairs.length) return false;
	for (const p of pairs) {
		if (p.parent === source && p.packageName === target) return true;
	}
	return false;
}

/**
 * Hide pad-rail **nodes** (in-rail and out-rail bars/chips).
 * Undraw import pad scaffolds: pure in-rail↔in-rail and External package hops
 * (parent→in-rail→External). When `pairs` is non-empty, also undraw any Carbon
 * link whose ends match a construction pair (including **direct** parent→package
 * attaches that skip rails) so straighten can paint once.
 * Export File→out-rail→deep-target ribbons stay painted.
 * Tooltips still scrub rail names via {@link alluvialTooltipCustomHTML}.
 * Pair with {@link straightenExternalPackageBands} for straight External bands.
 */
export function hideAlluvialRails(
	holder: HTMLElement,
	opts?: { pairs?: readonly Pick<ExternalStraightPair, 'parent' | 'packageName'>[] },
): void {
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<{ name?: string }>(el);
		const fromData = typeof d?.name === 'string' ? d.name : '';
		const textEl = el.querySelector<SVGTextElement>('text.node-text');
		const fromText = textEl?.textContent ?? '';
		if (!isAlluvialRailName(fromData) && !isAlluvialRailName(fromText)) {
			continue;
		}
		el.classList.add('atlas-alluvial-rail');
		el.setAttribute('aria-hidden', 'true');
		el.setAttribute('pointer-events', 'none');
		el.removeAttribute('title');
		for (const t of el.querySelectorAll('title')) t.remove();
		if (textEl) {
			textEl.textContent = '';
			textEl.removeAttribute('title');
			textEl.removeAttribute('aria-label');
			textEl.setAttribute('aria-hidden', 'true');
		}
		const bg = el.querySelector<SVGRectElement>('rect.node-text-bg');
		if (bg) {
			bg.setAttribute('width', '0');
			bg.setAttribute('height', '0');
			bg.setAttribute('opacity', '0');
		}
		const bar = el.querySelector<SVGRectElement>('rect.node');
		if (bar) {
			bar.setAttribute('width', '0');
			bar.setAttribute('opacity', '0');
		}
		const titleG = el.querySelector<SVGGElement>('g[id*="alluvial-node-title"]');
		if (titleG) {
			titleG.style.display = 'none';
			titleG.setAttribute('pointer-events', 'none');
		}
	}

	const pairs = opts?.pairs;
	const usePairs = Boolean(pairs?.length);

	// Import pad scaffold + External package hop pads (parent→in-rail→External).
	// When pairs present: also undraw direct pair-covered parent→package Carbon links.
	// Export out-rail mass carriers stay painted (unless pair-covered, which they aren't).
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<{
			source?: { name?: string; category?: string } | string;
			target?: { name?: string; category?: string } | string;
		}>(path);
		const sn =
			typeof link?.source === 'string'
				? link.source
				: (link?.source?.name ?? '');
		const tn =
			typeof link?.target === 'string'
				? link.target
				: (link?.target?.name ?? '');
		const sc =
			typeof link?.source === 'object' && link?.source
				? link.source.category
				: undefined;
		const tc =
			typeof link?.target === 'object' && link?.target
				? link.target.category
				: undefined;
		const scaffold = isImportPadScaffoldLink(sn, tn, {
			sourceCategory: sc,
			targetCategory: tc,
		});
		const pairCovered =
			usePairs && isExternalStraightPairLink(sn, tn, pairs!);
		if (!scaffold && !pairCovered) {
			continue;
		}
		path.classList.add('atlas-alluvial-pad-band');
		path.setAttribute('pointer-events', 'none');
		if (isInRailName(sn) && isInRailName(tn)) {
			path.classList.add('atlas-alluvial-rail-link');
		}
		if (isInRailName(sn) || isInRailName(tn) || pairCovered) {
			path.classList.add('atlas-alluvial-external-pad');
		}
	}
}

type LinkEnd = { name?: string; category?: string; x0?: number; x1?: number; y0?: number; y1?: number };

function endName(end: LinkEnd | string | undefined): string {
	if (typeof end === 'string') return end;
	return end?.name ?? '';
}

export type ExternalStraightBandPlan = {
	parent: string;
	packageName: string;
	parentCategory?: string;
	width: number;
	stroke: string;
	opacity: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
};

/**
 * Pure planner: given layout nodes + links, find External packages only
 * reachable via in-rail pads and return straight parent→package bands.
 *
 * When `pairs` is non-empty (hub construction meta), use those parent×package
 * widths instead of BFS through shared in-rails (which cross-products every
 * parent that padded into a rail with every package that left it).
 */
export function planExternalStraightBands(
	nodes: readonly {
		name: string;
		category?: string;
		x0: number;
		x1: number;
		y0: number;
		y1: number;
	}[],
	links: readonly {
		source: string;
		target: string;
		width: number;
		stroke?: string;
		opacity?: string;
	}[],
	pairs?: readonly ExternalStraightPair[],
): ExternalStraightBandPlan[] {
	const nodeByName = new Map(nodes.map((n) => [n.name, n]));
	const inbound = new Map<
		string,
		{ source: string; width: number; stroke: string; opacity: string }[]
	>();
	for (const l of links) {
		const list = inbound.get(l.target) ?? [];
		list.push({
			source: l.source,
			width: l.width,
			stroke: l.stroke ?? '#0d9488',
			opacity: l.opacity ?? '0.5',
		});
		inbound.set(l.target, list);
	}

	const externalNames = nodes
		.filter((n) => n.category === 'External' && !isAlluvialRailName(n.name))
		.map((n) => n.name);

	const styleFromInbound = (
		pkg: string,
	): { stroke: string; opacity: string } => {
		const directIn = inbound.get(pkg) ?? [];
		const railIn = directIn.find((e) => isInRailName(e.source));
		return {
			stroke: railIn?.stroke || directIn[0]?.stroke || '#0d9488',
			opacity: railIn?.opacity || directIn[0]?.opacity || '0.5',
		};
	};

	const realParents = (
		pkg: string,
	): { parent: string; width: number; stroke: string; opacity: string }[] => {
		const out: {
			parent: string;
			width: number;
			stroke: string;
			opacity: string;
		}[] = [];
		const seen = new Set<string>([pkg]);
		const q: {
			name: string;
			width: number;
			stroke: string;
			opacity: string;
		}[] = [{ name: pkg, width: 0, stroke: '', opacity: '' }];
		while (q.length) {
			const cur = q.shift()!;
			for (const edge of inbound.get(cur.name) ?? []) {
				if (isInRailName(edge.source)) {
					if (seen.has(edge.source)) continue;
					seen.add(edge.source);
					q.push({
						name: edge.source,
						width: edge.width,
						stroke: edge.stroke,
						opacity: edge.opacity,
					});
				} else if (!isAlluvialRailName(edge.source)) {
					// Only straighten when package was pad-routed (path touched a rail)
					if (cur.name === pkg && !isInRailName(cur.name)) {
						// direct parent→package (no pad) — skip straighten
						continue;
					}
					out.push({
						parent: edge.source,
						width: edge.width || cur.width || 1,
						stroke: edge.stroke || cur.stroke,
						opacity: edge.opacity || cur.opacity,
					});
				}
			}
		}
		return out;
	};

	const plans: ExternalStraightBandPlan[] = [];
	const drawn = new Set<string>();
	const usePairs = Boolean(pairs?.length);

	// Optional construction pairs: merge widths for same parent×package
	const pairsByPkg = new Map<
		string,
		{ parent: string; width: number }[]
	>();
	if (usePairs) {
		for (const p of pairs!) {
			if (p.width <= 0 || !p.parent || !p.packageName) continue;
			const list = pairsByPkg.get(p.packageName) ?? [];
			const prev = list.find((x) => x.parent === p.parent);
			if (prev) prev.width += p.width;
			else list.push({ parent: p.parent, width: p.width });
			pairsByPkg.set(p.packageName, list);
		}
	}

	for (const pkg of externalNames) {
		// Must have at least one inbound from an in-rail (pad topology)
		const directIn = inbound.get(pkg) ?? [];
		if (!directIn.some((e) => isInRailName(e.source))) continue;

		const pkgNode = nodeByName.get(pkg);
		if (!pkgNode) continue;

		const parents = usePairs
			? (pairsByPkg.get(pkg) ?? []).map((p) => {
					const style = styleFromInbound(pkg);
					return {
						parent: p.parent,
						width: p.width,
						stroke: style.stroke,
						opacity: style.opacity,
					};
				})
			: realParents(pkg);
		if (!parents.length) continue;

		for (const { parent, width, stroke, opacity } of parents) {
			const key = `${parent}\0${pkg}`;
			if (drawn.has(key)) continue;
			drawn.add(key);
			const pNode = nodeByName.get(parent);
			if (!pNode) continue;
			plans.push({
				parent,
				packageName: pkg,
				parentCategory: pNode.category,
				width,
				stroke,
				opacity,
				x0: pNode.x1,
				y0: (pNode.y0 + pNode.y1) / 2,
				x1: pkgNode.x0,
				y1: (pkgNode.y0 + pkgNode.y1) / 2,
			});
		}
	}
	return plans;
}

/**
 * After undrawing External package pad kinks (File → in-rail → package), paint a
 * single straight band from the real parent to the External package so the chart
 * does not show an intermediate hop on Imports.
 */
export function straightenExternalPackageBands(
	holder: HTMLElement,
	opts?: { pairs?: readonly ExternalStraightPair[] },
): void {
	const nodes: {
		name: string;
		category?: string;
		x0: number;
		x1: number;
		y0: number;
		y1: number;
	}[] = [];
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<SankeyNode>(el);
		if (!d?.name) continue;
		nodes.push({
			name: d.name,
			category: d.category,
			x0: d.x0,
			x1: d.x1,
			y0: d.y0,
			y1: d.y1,
		});
	}

	type RawLink = {
		source?: LinkEnd | string;
		target?: LinkEnd | string;
		value?: number;
		width?: number;
	};

	const linkSpecs: {
		source: string;
		target: string;
		width: number;
		stroke: string;
		opacity: string;
	}[] = [];
	for (const el of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const d = readData<RawLink>(el);
		if (!d) continue;
		const sn = endName(d.source);
		const tn = endName(d.target);
		if (!sn || !tn) continue;
		const width =
			typeof d.width === 'number' && d.width > 0
				? d.width
				: typeof d.value === 'number'
					? d.value
					: 1;
		let stroke = el.style?.stroke || el.getAttribute?.('stroke') || '';
		if (!stroke && typeof getComputedStyle === 'function') {
			try {
				stroke = getComputedStyle(el).stroke;
			} catch {
				stroke = '';
			}
		}
		const opacity =
			el.style?.strokeOpacity ||
			el.getAttribute?.('stroke-opacity') ||
			'0.5';
		linkSpecs.push({
			source: sn,
			target: tn,
			width,
			stroke: stroke || '#0d9488',
			opacity,
		});
	}

	const plans = planExternalStraightBands(nodes, linkSpecs, opts?.pairs);
	if (!plans.length) return;

	// Prefer the Carbon link layer group
	const linkLayer =
		[...holder.querySelectorAll('path.link')][0]?.parentElement ??
		holder.querySelector('svg') ??
		holder;

	// MiniEl / non-SVG fixtures: skip DOM inject (planner is unit-tested)
	if (typeof document === 'undefined' || !document.createElementNS) return;
	if (
		linkLayer &&
		typeof (linkLayer as { appendChild?: unknown }).appendChild !== 'function'
	) {
		return;
	}

	for (const plan of plans) {
		const path = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'path',
		);
		path.setAttribute('class', 'link atlas-alluvial-external-straight');
		path.setAttribute(
			'd',
			horizontalLinkPath(plan.x0, plan.y0, plan.x1, plan.y1),
		);
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke-width', String(Math.max(1, plan.width)));
		path.style.stroke = plan.stroke;
		path.style.strokeOpacity = plan.opacity || '0.5';
		path.setAttribute('aria-label', `${plan.parent} → ${plan.packageName}`);
		(path as unknown as { __data__?: unknown }).__data__ = {
			source: { name: plan.parent, category: plan.parentCategory },
			target: { name: plan.packageName, category: 'External' },
			value: plan.width,
			width: plan.width,
			y0: plan.y0,
			y1: plan.y1,
		};
		try {
			linkLayer.appendChild(path);
		} catch {
			// MiniEl appendChild may reject real SVGPathElement
		}
	}
}

/**
 * Mark reverse free-source pad targets (Exports* free sources, left).
 * CSS: **cyan** wrap — contrast on yellow export columns (not yellow-on-yellow).
 * Does not override File purple spine.
 */
export function markAlluvialTerminators(
	holder: HTMLElement,
	terminators: readonly string[] | undefined,
): void {
	if (!terminators?.length) return;
	const set = new Set(terminators);
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<{ name?: string }>(el);
		const name = typeof d?.name === 'string' ? d.name : '';
		if (!name || !set.has(name)) continue;
		// Never treat rails as terminators; never fight File spine
		if (isAlluvialRailName(name)) continue;
		const cat = (d as { category?: string }).category;
		if (cat === 'File') continue;
		// Cyan class (historical "export-terminator" name = cyan chrome)
		el.classList.add('atlas-alluvial-export-terminator');
	}
}

/**
 * Mark forward true leaves (Imports* / External).
 * - File leaves on Imports*: **yellow** wrap (contrast on cyan columns)
 * - Packages / unresolved / External buckets: **purple** wrap (unique package
 *   chrome; future icon affordance can target the same class)
 */
export function markAlluvialExportTerminators(
	holder: HTMLElement,
	exportTerminators: readonly string[] | undefined,
): void {
	if (!exportTerminators?.length) return;
	const set = new Set(exportTerminators);
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<{ name?: string; category?: string }>(el);
		const name = typeof d?.name === 'string' ? d.name : '';
		if (!name || !set.has(name)) continue;
		if (isAlluvialRailName(name)) continue;
		const cat = d?.category;
		if (cat === 'File') continue;
		// External column = package / unresolved / package buckets
		if (cat === 'External') {
			el.classList.add('atlas-alluvial-package-terminator');
		} else {
			el.classList.add('atlas-alluvial-terminator');
		}
	}
}

export function rightTruncateAlluvialLabels(
	holder: HTMLElement,
	maxChars: number = ALLUVIAL_LABEL_MAX_CHARS,
): void {
	hideAlluvialRails(holder);

	for (const text of holder.querySelectorAll<SVGTextElement>('text.node-text')) {
		const full = text.textContent ?? '';
		if (!full) continue;
		// Match "label (value)" — value may be "1.2k" etc.
		const m = full.match(/^(.*) \(([^()]*)\)$/);
		const name = m ? m[1]! : full;
		const value = m ? m[2]! : null;
		const g = text.parentElement;
		const bg = g?.querySelector<SVGRectElement>('rect.node-text-bg');

		if (isAlluvialRailName(name)) {
			text.textContent = '';
			continue;
		}

		const truncName = rightTruncateLabel(name, maxChars);
		if (truncName === name) {
			// Still expose full name for hover when already short
			if (!text.getAttribute('title')) text.setAttribute('title', name);
			continue;
		}
		const next = value !== null ? `${truncName} (${value})` : truncName;
		text.textContent = next;
		text.setAttribute('title', name);
		text.setAttribute('aria-label', full);
		// Carbon sizes label bg from full text width — shrink to truncated length
		if (bg && typeof text.getComputedTextLength === 'function') {
			try {
				const w = text.getComputedTextLength();
				if (w > 0) bg.setAttribute('width', String(Math.ceil(w + 8)));
			} catch {
				// jsdom / detached SVG — skip bg resize
			}
		}
	}
}

/**
 * Optional hub File vertical centering on a mounted Carbon alluvial.
 * Does not top-pack columns — Carbon keeps its own column anchors.
 */
export function topPackAlluvialHolder(
	holder: HTMLElement,
	opts?: { centerHubFile?: boolean },
): void {
	const bound = collectBoundNodes(holder);
	if (bound.length < 2) return;

	const nodes = bound.map((b) => b.d);
	const movedCenter =
		opts?.centerHubFile === false ? 0 : centerHubFileSpine(nodes);

	if (movedCenter <= 0) return;
	writeNodeTransformsAndLinks(holder, bound);
}

/**
 * Carbon alluvial paints band strokes from the **source** node color.
 * Export side (right, yellow — packages/files the focus imports) should keep
 * yellow bands when painted from File or another export-side source.
 */
export function isExportSideCategory(category: string): boolean {
	return (
		category === 'Exports' ||
		category === 'Exporters' ||
		category.startsWith('Export hop')
	);
}

export function recolorExportBands(
	holder: HTMLElement,
	colorScale: Record<string, string>,
): void {
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<{
			source?: { name?: string; category?: string };
			target?: { name?: string; category?: string };
		}>(path);
		const target = link?.target;
		if (!target?.name) continue;
		const cat = target.category ?? '';
		if (!isExportSideCategory(cat)) continue;
		const color = colorScale[target.name];
		if (!color) continue;
		path.style.stroke = color;
	}
}

export function isFileCategory(category: string | undefined): boolean {
	return category === 'File';
}

/**
 * Mark File-category node bars and inject a Carbon document icon in place of
 * the "File" column header text (keeps aria-label "File").
 */
export function highlightFileSpine(holder: HTMLElement): void {
	// Node bars + path labels
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<SankeyNode>(el);
		if (!isFileCategory(d?.category)) continue;
		el.classList.add('atlas-alluvial-file-spine');
	}

	// Category headers (Carbon: g.header-arrows > text)
	for (const text of holder.querySelectorAll<SVGTextElement>(
		'g.header-arrows text, .header-arrows text',
	)) {
		const label = (text.textContent ?? '').trim();
		if (label !== 'File') continue;
		text.classList.add('atlas-alluvial-file-header');
		injectFileHeaderIcon(text);
	}
}

/**
 * Replace visible "File" header text with Document-16 icon.
 * Full string stays on aria-label for screen readers.
 */
export function injectFileHeaderIcon(textEl: SVGTextElement): void {
	const parent = textEl.parentElement;
	if (!parent || parent.querySelector('.atlas-alluvial-file-header-icon')) return;

	textEl.setAttribute('aria-label', 'File');
	textEl.setAttribute('aria-hidden', 'true');
	// Keep layout anchor; hide glyphs
	textEl.style.fill = 'transparent';
	textEl.textContent = '';

	const x = Number.parseFloat(textEl.getAttribute('x') ?? '0') || 0;
	const y = Number.parseFloat(textEl.getAttribute('y') ?? '20') || 20;

	const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	wrap.classList.add('atlas-alluvial-file-header-icon');
	wrap.setAttribute('aria-hidden', 'true');
	// Icon is 16×16; center under former text baseline
	wrap.setAttribute('transform', `translate(${x}, ${y - 14})`);

	try {
		const parsed = new DOMParser().parseFromString(fileHeaderIconSvg(), 'image/svg+xml');
		const icon = parsed.documentElement;
		if (icon && icon.tagName.toLowerCase() === 'svg') {
			icon.setAttribute('width', '16');
			icon.setAttribute('height', '16');
			icon.setAttribute('fill', FILE_SPINE_SELECT);
			icon.style.fill = FILE_SPINE_SELECT;
			// Import into current document
			const adopted = document.importNode(icon, true);
			wrap.appendChild(adopted);
			parent.appendChild(wrap);
			return;
		}
	} catch {
		// fall through to path fallback
	}

	// Minimal document glyph if icon parse fails
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute(
		'd',
		'M4 2h6l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm6 1.5V7h3.5',
	);
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', FILE_SPINE_SELECT);
	path.setAttribute('stroke-width', '1.25');
	wrap.appendChild(path);
	parent.appendChild(wrap);
}

/**
 * Center hub File spine, highlight File column, right-truncate labels, recolor exports.
 * Hides pad rails / pad bands; marks hub terminators from meta.
 */
export function polishAlluvialHolder(
	holder: HTMLElement,
	opts?: {
		colorScale?: Record<string, string>;
		/** Default true — center File when it has both import and export edges. */
		centerHubFile?: boolean;
		/** Max chars for node name (default {@link ALLUVIAL_LABEL_MAX_CHARS}). */
		labelMaxChars?: number;
		/**
		 * Reverse free-source pad targets (Exports* left) → cyan wrap.
		 * @see markAlluvialTerminators
		 */
		terminators?: readonly string[];
		/**
		 * Forward true leaves (Imports / External, right) → yellow wrap.
		 * @see markAlluvialExportTerminators
		 */
		exportTerminators?: readonly string[];
		/**
		 * Construction-time External parent→package pairs (hub meta).
		 * @see straightenExternalPackageBands / planExternalStraightBands
		 */
		externalStraightPairs?: readonly ExternalStraightPair[];
	},
): void {
	topPackAlluvialHolder(holder, { centerHubFile: opts?.centerHubFile });
	rightTruncateAlluvialLabels(holder, opts?.labelMaxChars ?? ALLUVIAL_LABEL_MAX_CHARS);
	// Undraw scaffolds + any pair-covered parent→package (incl. direct deepest attaches)
	hideAlluvialRails(holder, { pairs: opts?.externalStraightPairs });
	// Then paint one straight parent→package band per construction pair
	straightenExternalPackageBands(holder, {
		pairs: opts?.externalStraightPairs,
	});
	// Contrast: cyan on yellow Exports free sources; yellow on cyan Imports leaves
	markAlluvialTerminators(holder, opts?.terminators);
	markAlluvialExportTerminators(holder, opts?.exportTerminators);
	highlightFileSpine(holder);
	if (opts?.colorScale) recolorExportBands(holder, opts.colorScale);
	const svg = holder.querySelector('svg');
	if (svg) svg.style.overflow = 'visible';
}
