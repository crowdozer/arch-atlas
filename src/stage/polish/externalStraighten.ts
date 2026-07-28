/**
 * External package band straighten: pair predicate, plan, and paint.
 */

import {
	isAlluvialRailName,
	isInRailName,
} from '@core/view/alluvial.ts';
import { CHART_PALETTE } from '@core/view/chartPalette.ts';
import {
	horizontalLinkRibbonPath,
	readData,
	type SankeyNode,
} from './sankeyDom.ts';

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

type LinkEnd = {
	name?: string;
	category?: string;
	x0?: number;
	x1?: number;
	y0?: number;
	y1?: number;
};

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
			stroke: l.stroke ?? CHART_PALETTE.brand,
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
			stroke: railIn?.stroke || directIn[0]?.stroke || CHART_PALETTE.brand,
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
		const pkgNode = nodeByName.get(pkg);
		if (!pkgNode) continue;

		// Pairs path: paint every construction parent even when topology is a
		// *direct* file→package (no in-rail). Undraw already hides that Carbon
		// link; without this gate-open, focus-only packages (types.ts→zod)
		// vanish after pair undraw.
		// BFS path: still require pad topology (rail inbound) so bare direct
		// File→pkg charts leave Carbon alone (no double paint, no phantom).
		if (!usePairs) {
			const directIn = inbound.get(pkg) ?? [];
			if (!directIn.some((e) => isInRailName(e.source))) continue;
		} else if (!pairsByPkg.has(pkg)) {
			continue;
		}

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
		// After rewriteLinkRibbons, mass is fill (stroke none) — prefer fill color
		let stroke = el.style?.stroke || el.getAttribute?.('stroke') || '';
		if (!stroke || stroke === 'none') {
			stroke = el.style?.fill || el.getAttribute?.('fill') || '';
		}
		if ((!stroke || stroke === 'none') && typeof getComputedStyle === 'function') {
			try {
				const cs = getComputedStyle(el);
				stroke = cs.stroke && cs.stroke !== 'none' ? cs.stroke : cs.fill;
			} catch {
				stroke = '';
			}
		}
		const opacity =
			el.style?.fillOpacity ||
			el.getAttribute?.('fill-opacity') ||
			el.style?.strokeOpacity ||
			el.getAttribute?.('stroke-opacity') ||
			'0.5';
		linkSpecs.push({
			source: sn,
			target: tn,
			width,
			stroke: stroke && stroke !== 'none' ? stroke : CHART_PALETTE.brand,
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
			horizontalLinkRibbonPath(
				plan.x0,
				plan.y0,
				plan.x1,
				plan.y1,
				plan.width,
			),
		);
		// Filled ribbon (mass in geometry) — same model as rewriteLinkRibbons
		path.setAttribute('fill', plan.stroke);
		path.setAttribute('stroke', 'none');
		path.setAttribute('stroke-width', '0');
		// Hit-testable on fill area: undrawn Carbon pair links have pointer-events none;
		// straighten is the only interactive ribbon for External package hops.
		path.style.pointerEvents = 'fill';
		path.style.fill = plan.stroke;
		path.style.stroke = 'none';
		path.style.strokeWidth = '0';
		const op = plan.opacity || '0.5';
		path.style.fillOpacity = op;
		path.setAttribute('fill-opacity', op);
		path.dataset.baseOpacity = op;
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
