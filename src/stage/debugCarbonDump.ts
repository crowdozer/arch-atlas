/**
 * Read-only snapshot of Carbon/d3-sankey layout from a mounted holder.
 * For agent/debug analysis - not used in production paint path.
 */

import { readData, type SankeyLink, type SankeyNode } from './polish/sankeyDom.ts';

export type CarbonNodeDump = {
	name: string;
	category?: string;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	height: number;
	sourceLinkCount: number;
	targetLinkCount: number;
	classes: string;
};

export type CarbonLinkDump = {
	source: string;
	target: string;
	value?: number;
	width?: number;
	y0?: number;
	y1?: number;
	classes: string;
	straight: boolean;
	pad: boolean;
	focus: boolean;
	dim: boolean;
};

export type CarbonRenderDump = {
	nodeCount: number;
	linkCount: number;
	nodes: CarbonNodeDump[];
	links: CarbonLinkDump[];
	/** Column headers if Carbon left them in DOM. */
	headers: string[];
	svg?: { width: string | null; height: string | null; viewBox: string | null };
};

function endName(end: unknown): string {
	if (typeof end === 'string') return end;
	if (end && typeof end === 'object' && 'name' in end) {
		const n = (end as { name?: string }).name;
		return typeof n === 'string' ? n : '';
	}
	return '';
}

/**
 * Snapshot Carbon node/link geometry + focus/dim classes from the mounted holder.
 */
export function dumpCarbonRender(holder: HTMLElement | null): CarbonRenderDump | null {
	if (!holder) return null;

	const nodes: CarbonNodeDump[] = [];
	for (const g of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<SankeyNode>(g);
		if (!d || typeof d.name !== 'string') continue;
		const h = typeof d.y1 === 'number' && typeof d.y0 === 'number' ? d.y1 - d.y0 : 0;
		nodes.push({
			name: d.name,
			category: d.category,
			x0: d.x0,
			x1: d.x1,
			y0: d.y0,
			y1: d.y1,
			height: h,
			sourceLinkCount: d.sourceLinks?.length ?? 0,
			targetLinkCount: d.targetLinks?.length ?? 0,
			classes: g.getAttribute('class') ?? '',
		});
	}

	const links: CarbonLinkDump[] = [];
	for (const p of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const d = readData<SankeyLink>(p);
		const source = endName(d?.source);
		const target = endName(d?.target);
		const classes = p.getAttribute('class') ?? '';
		const straight = classes.includes('atlas-alluvial-external-straight');
		const pad = classes.includes('atlas-alluvial-pad-band');
		links.push({
			source,
			target,
			value:
				d && typeof (d as { value?: number }).value === 'number'
					? (d as { value: number }).value
					: undefined,
			width: typeof d?.width === 'number' ? d.width : undefined,
			y0: typeof d?.y0 === 'number' ? d.y0 : undefined,
			y1: typeof d?.y1 === 'number' ? d.y1 : undefined,
			classes,
			straight,
			pad,
			focus: straight
				? classes.includes('atlas-alluvial-external-straight--focus')
				: classes.includes('atlas-alluvial-carbon-link-focus'),
			dim: straight ? false : classes.includes('atlas-alluvial-carbon-link-dim'),
		});
	}

	const headers: string[] = [];
	for (const t of holder.querySelectorAll('text.atlas-alluvial-column-header, text')) {
		const text = (t.textContent ?? '').trim();
		// Carbon column titles are often short category labels
		if (text && text.length < 40 && !headers.includes(text)) {
			// Keep only likely headers (heuristic) - also include all if few texts
			headers.push(text);
		}
	}

	const svg = holder.querySelector('svg');
	return {
		nodeCount: nodes.length,
		linkCount: links.length,
		nodes,
		links,
		headers: headers.slice(0, 32),
		svg: svg
			? {
					width: svg.getAttribute('width'),
					height: svg.getAttribute('height'),
					viewBox: svg.getAttribute('viewBox'),
				}
			: undefined,
	};
}
