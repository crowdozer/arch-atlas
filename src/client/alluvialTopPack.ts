/**
 * Post-process Carbon alluvial SVG after mount:
 * Top-pack columns (d3-sankey floats sparse File/Modules mid/low).
 *
 * Label edge clearance is CSS padding on the chart holder (see carbon-theme),
 * not an SVG viewBox — Carbon often sets width="100%", which breaks viewBox math.
 */

type SankeyLink = {
	y0: number;
	y1: number;
	width: number;
	source: SankeyNode;
	target: SankeyNode;
};

type SankeyNode = {
	name?: string;
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

function colKey(x0: number): number {
	return Math.round(x0 * 1000) / 1000;
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
 * Shift each column so its minimum y0 equals the global minimum y0
 * (typically the densest column already near the top).
 * Mutates node y0/y1 in place. Returns total |dy| applied (0 if no-op).
 */
export function topPackColumns(nodes: SankeyNode[]): number {
	if (nodes.length < 2) return 0;

	const byCol = new Map<number, SankeyNode[]>();
	for (const n of nodes) {
		const k = colKey(n.x0);
		const list = byCol.get(k) ?? [];
		list.push(n);
		byCol.set(k, list);
	}
	if (byCol.size < 2) return 0;

	const colMins = [...byCol.values()].map((col) =>
		Math.min(...col.map((n) => n.y0)),
	);
	const yTarget = Math.min(...colMins);
	let moved = 0;

	for (const col of byCol.values()) {
		const colMin = Math.min(...col.map((n) => n.y0));
		const dy = yTarget - colMin;
		if (Math.abs(dy) < 0.5) continue;
		moved += Math.abs(dy);
		for (const n of col) {
			n.y0 += dy;
			n.y1 += dy;
		}
	}

	if (moved > 0) recomputeLinkBreadths(nodes);
	return moved;
}

/**
 * Apply top-pack to a mounted Carbon alluvial holder (mutates SVG in place).
 */
export function topPackAlluvialHolder(holder: HTMLElement): void {
	const nodeEls = [
		...holder.querySelectorAll<SVGGElement>('g.node-group'),
	];
	if (nodeEls.length < 2) return;

	const bound: NodeEl[] = [];
	for (const el of nodeEls) {
		const d = readData<SankeyNode>(el);
		if (!d || typeof d.x0 !== 'number' || typeof d.y0 !== 'number') continue;
		bound.push({ el, d });
	}
	if (bound.length < 2) return;

	const moved = topPackColumns(bound.map((b) => b.d));
	if (moved <= 0) return;

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
 * Top-pack columns. Label clearance is CSS on `.atlas-stage__holder`.
 */
export function polishAlluvialHolder(holder: HTMLElement): void {
	topPackAlluvialHolder(holder);
	const svg = holder.querySelector('svg');
	if (svg) svg.style.overflow = 'visible';
}
