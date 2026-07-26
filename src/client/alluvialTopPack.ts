/**
 * Post-process Carbon alluvial SVG after mount:
 * 1. Top-pack columns (d3-sankey floats sparse columns mid/low).
 * 2. Center hub File spine when both sides have edges (asymmetric hops).
 * 3. Recolor File→Exports bands (Carbon paints stroke from source).
 *
 * Label edge clearance is CSS padding on the chart holder (see carbon-theme).
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
 * Apply top-pack (+ optional hub File centering) to a mounted Carbon alluvial.
 */
export function topPackAlluvialHolder(
	holder: HTMLElement,
	opts?: { centerHubFile?: boolean },
): void {
	const bound = collectBoundNodes(holder);
	if (bound.length < 2) return;

	const nodes = bound.map((b) => b.d);
	const movedTop = topPackColumns(nodes);
	const movedCenter =
		opts?.centerHubFile === false ? 0 : centerHubFileSpine(nodes);

	if (movedTop <= 0 && movedCenter <= 0) return;
	writeNodeTransformsAndLinks(holder, bound);
}

/**
 * Carbon alluvial paints band strokes from the **source** node color.
 * Hub File→Exports links therefore stay teal. Recolor any link whose
 * target category is Exports (or legacy Exporters) from the color scale.
 */
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
		if (cat !== 'Exports' && cat !== 'Exporters') continue;
		const color = colorScale[target.name];
		if (!color) continue;
		path.style.stroke = color;
	}
}

/**
 * Top-pack columns, center hub File spine, recolor export bands.
 */
export function polishAlluvialHolder(
	holder: HTMLElement,
	opts?: {
		colorScale?: Record<string, string>;
		/** Default true — center File when it has both import and export edges. */
		centerHubFile?: boolean;
	},
): void {
	topPackAlluvialHolder(holder, { centerHubFile: opts?.centerHubFile });
	if (opts?.colorScale) recolorExportBands(holder, opts.colorScale);
	const svg = holder.querySelector('svg');
	if (svg) svg.style.overflow = 'visible';
}
