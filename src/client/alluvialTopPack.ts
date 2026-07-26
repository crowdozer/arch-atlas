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
import { isAlluvialRailName } from '@core/view/alluvial.ts';

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
/** Prefer {@link isAlluvialRailName} — same predicate (pad-rail ids). */
export function isImportRailLabel(name: string): boolean {
	return isAlluvialRailName(name);
}

/**
 * Hide pad-rail **nodes** (unlabeled bars on outer hops) and make any band with
 * a rail endpoint invisible + non-interactive (layout mass kept; no ghost paint).
 * Link tooltips for residual rail→file are cleaned via {@link alluvialTooltipCustomHTML}.
 */
export function hideAlluvialRails(holder: HTMLElement): void {
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

	// Any band with a rail endpoint is scaffolding — invisible + no hover
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<{
			source?: { name?: string } | string;
			target?: { name?: string } | string;
		}>(path);
		const sn =
			typeof link?.source === 'string'
				? link.source
				: (link?.source?.name ?? '');
		const tn =
			typeof link?.target === 'string'
				? link.target
				: (link?.target?.name ?? '');
		const sRail = isAlluvialRailName(sn);
		const tRail = isAlluvialRailName(tn);
		if (!sRail && !tRail) continue;
		path.classList.add('atlas-alluvial-pad-band');
		path.setAttribute('pointer-events', 'none');
		// Rail→rail also keep the older class for selectors that already use it
		if (sRail && tRail) {
			path.classList.add('atlas-alluvial-rail-link');
		}
	}
}

/**
 * Mark reverse-hop free-source files that were pad targets (hub terminators).
 * CSS applies yellow stroke wrap; does not override File purple spine.
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
		el.classList.add('atlas-alluvial-terminator');
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
		/** Hub meta.terminators — reverse-hop free-source pad targets. */
		terminators?: readonly string[];
	},
): void {
	topPackAlluvialHolder(holder, { centerHubFile: opts?.centerHubFile });
	rightTruncateAlluvialLabels(holder, opts?.labelMaxChars ?? ALLUVIAL_LABEL_MAX_CHARS);
	hideAlluvialRails(holder);
	markAlluvialTerminators(holder, opts?.terminators);
	highlightFileSpine(holder);
	if (opts?.colorScale) recolorExportBands(holder, opts.colorScale);
	const svg = holder.querySelector('svg');
	if (svg) svg.style.overflow = 'visible';
}
