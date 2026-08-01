/**
 * Enforce in-column vertical order from payload `meta.nodeRank`.
 *
 * Carbon/d3-sankey runs crossing reduction without `nodeSort`, so payload order
 * is only an initial seed. After layout, restack peers in each column so the
 * Band order control (name / mass) is visually trustworthy.
 */

import {
	readData,
	recomputeLinkBreadths,
	type NodeEl,
	type SankeyLink,
	type SankeyNode,
} from './sankeyDom.ts';

/** Column key: round x0 so tiny float noise does not split peers. */
function columnKey(n: SankeyNode): number {
	return Math.round(n.x0);
}

/**
 * Within each column (shared x0), restack nodes top→bottom by `nodeRank`
 * ascending (rank 0 at top). Preserves each node's height and redistributes
 * inter-node gaps so the column's previous y-span is reused.
 *
 * Mutates nodes in place. Returns true if any node moved.
 */
export function stackBandsByNodeRank(
	nodes: SankeyNode[],
	nodeRank: Record<string, number>,
): boolean {
	if (nodes.length < 2 || !Object.keys(nodeRank).length) return false;

	const byCol = new Map<number, SankeyNode[]>();
	for (const n of nodes) {
		if (typeof n.x0 !== 'number' || typeof n.y0 !== 'number') continue;
		const k = columnKey(n);
		const list = byCol.get(k);
		if (list) list.push(n);
		else byCol.set(k, [n]);
	}

	let moved = false;
	for (const col of byCol.values()) {
		if (col.length < 2) continue;
		if (restackColumn(col, nodeRank)) moved = true;
	}
	if (moved) recomputeLinkBreadths(nodes);
	return moved;
}

function restackColumn(
	col: SankeyNode[],
	nodeRank: Record<string, number>,
): boolean {
	const byY = [...col].sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1);
	const yTop = byY[0]!.y0;
	const yBottom = Math.max(...byY.map((n) => n.y1));
	const heights = byY.map((n) => Math.max(0, n.y1 - n.y0));
	const totalH = heights.reduce((s, h) => s + h, 0);
	const span = yBottom - yTop;
	const gapBudget = Math.max(0, span - totalH);
	const gap =
		byY.length > 1 ? gapBudget / (byY.length - 1) : 0;

	const byRank = [...col].sort((a, b) => {
		const ra = rankOf(a, nodeRank);
		const rb = rankOf(b, nodeRank);
		if (ra !== rb) return ra - rb;
		return (a.name ?? '').localeCompare(b.name ?? '');
	});

	// Already in rank order with same tops? skip writes
	let already = true;
	for (let i = 0; i < byRank.length; i++) {
		if (byRank[i] !== byY[i]) {
			already = false;
			break;
		}
	}
	if (already) return false;

	let y = yTop;
	for (let i = 0; i < byRank.length; i++) {
		const n = byRank[i]!;
		const h = Math.max(0, n.y1 - n.y0);
		n.y0 = y;
		n.y1 = y + h;
		y = n.y1 + (i < byRank.length - 1 ? gap : 0);
	}
	return true;
}

function rankOf(n: SankeyNode, nodeRank: Record<string, number>): number {
	const name = n.name;
	if (name && name in nodeRank) return nodeRank[name]!;
	// Unknown (should not happen for hub peers) - park after ranked nodes
	return Number.MAX_SAFE_INTEGER;
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
	// Centerline paths only - ribbons rewrite next in polish pipeline
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<SankeyLink>(path);
		if (!link?.source || !link?.target) continue;
		if (typeof link.y0 !== 'number' || typeof link.y1 !== 'number') continue;
		const x0 = link.source.x1;
		const x1 = link.target.x0;
		if (typeof x0 !== 'number' || typeof x1 !== 'number') continue;
		const mx = (x0 + x1) / 2;
		path.setAttribute(
			'd',
			`M${x0},${link.y0}C${mx},${link.y0} ${mx},${link.y1} ${x1},${link.y1}`,
		);
	}
}

/**
 * Restack mounted Carbon alluvial bands by payload `meta.nodeRank`.
 * No-op when ranks are missing or empty.
 */
export function stackBandsByNodeRankInHolder(
	holder: HTMLElement,
	nodeRank?: Record<string, number> | null,
): void {
	if (!nodeRank || !Object.keys(nodeRank).length) return;
	const bound = collectBoundNodes(holder);
	if (bound.length < 2) return;
	const nodes = bound.map((b) => b.d);
	if (!stackBandsByNodeRank(nodes, nodeRank)) return;
	writeNodeTransformsAndLinks(holder, bound);
}
