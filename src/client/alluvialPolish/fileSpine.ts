/**
 * Hub File spine vertical centering after Carbon mount.
 */

import {
	horizontalLinkPath,
	readData,
	recomputeLinkBreadths,
	type NodeEl,
	type SankeyLink,
	type SankeyNode,
} from './sankeyDom.ts';

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
 * Optional hub File vertical centering on a mounted Carbon alluvial.
 * Does not top-pack columns — Carbon keeps its own column anchors.
 *
 * (Formerly `topPackAlluvialHolder`.)
 */
export function centerHubFileSpineInHolder(
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
