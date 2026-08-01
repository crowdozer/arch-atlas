/**
 * Shared Sankey / Carbon `__data__` types and path geometry helpers.
 */

import { CHART_PALETTE } from '@core/view/chartPalette.ts';

export type SankeyLink = {
	y0: number;
	y1: number;
	width: number;
	source: SankeyNode;
	target: SankeyNode;
};

export type SankeyNode = {
	name?: string;
	category?: string;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	sourceLinks?: SankeyLink[];
	targetLinks?: SankeyLink[];
};

export type NodeEl = {
	el: SVGGElement;
	d: SankeyNode;
};

export function readData<T>(el: Element): T | null {
	const raw = (el as unknown as { __data__?: T }).__data__;
	return raw ?? null;
}

export function horizontalLinkPath(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): string {
	const mx = (x0 + x1) / 2;
	return `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
}

/**
 * Closed filled ribbon: top cubic at y − w/2, bottom cubic reverse at y + w/2.
 *
 * Mass lives in path area (fill), not stroke-width offset of a centerline -
 * avoids evolute cusps when width ≈ node height and |Δy| is large.
 *
 * @see horizontalLinkPath for the thin/reference centerline form
 */
export function horizontalLinkRibbonPath(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	width: number,
): string {
	const w = Math.max(1, width);
	const hw = w / 2;
	const mx = (x0 + x1) / 2;
	const y0t = y0 - hw;
	const y0b = y0 + hw;
	const y1t = y1 - hw;
	const y1b = y1 + hw;
	// Top L→R, vertical face at target, bottom R→L, Z closes vertical face at source
	return `M${x0},${y0t}C${mx},${y0t} ${mx},${y1t} ${x1},${y1t}L${x1},${y1b}C${mx},${y1b} ${mx},${y0b} ${x0},${y0b}Z`;
}

/** Resolve paint color for a Carbon/our path.link (stroke preferred, then fill). */
function linkPaintColor(path: SVGPathElement): string {
	let stroke =
		(path.style && path.style.stroke) || path.getAttribute?.('stroke') || '';
	if ((!stroke || stroke === 'none') && typeof getComputedStyle === 'function') {
		try {
			stroke = getComputedStyle(path).stroke;
		} catch {
			stroke = '';
		}
	}
	if (stroke && stroke !== 'none') return stroke;
	const fill =
		(path.style && path.style.fill) || path.getAttribute?.('fill') || '';
	if (fill && fill !== 'none') return fill;
	return CHART_PALETTE.brand;
}

/**
 * Unconditional post-layout rewrite: every `path.link` with sankey `__data__`
 * becomes a filled ribbon (mass in geometry). Preserves classes + `__data__`.
 *
 * Call after File spine center so Carbon centerline + stroke-width paint is
 * replaced even when File did not move.
 */
export function rewriteLinkRibbons(holder: HTMLElement): void {
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<SankeyLink>(path);
		if (!link?.source || !link?.target) continue;
		if (typeof link.y0 !== 'number' || typeof link.y1 !== 'number') continue;
		const x0 = link.source.x1;
		const x1 = link.target.x0;
		if (typeof x0 !== 'number' || typeof x1 !== 'number') continue;

		const width =
			typeof link.width === 'number' && link.width > 0 ? link.width : 1;
		path.setAttribute(
			'd',
			horizontalLinkRibbonPath(x0, link.y0, x1, link.y1, width),
		);

		const color = linkPaintColor(path);
		path.setAttribute('fill', color);
		path.setAttribute('stroke', 'none');
		path.setAttribute('stroke-width', '0');
		if (path.style) {
			path.style.fill = color;
			path.style.stroke = 'none';
			path.style.strokeWidth = '0';
		}

		// Transfer Carbon stroke-opacity → fill-opacity (idle ~0.8)
		const strokeOp =
			(path.style && path.style.strokeOpacity) ||
			path.getAttribute?.('stroke-opacity') ||
			'';
		const fillOp =
			(path.style && path.style.fillOpacity) ||
			path.getAttribute?.('fill-opacity') ||
			strokeOp ||
			'0.8';
		path.setAttribute('fill-opacity', fillOp);
		if (path.style) {
			path.style.fillOpacity = fillOp;
			path.style.strokeOpacity = '';
		}
		path.removeAttribute?.('stroke-opacity');
	}
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
