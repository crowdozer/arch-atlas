/**
 * Post-Carbon alluvial geometry - same topology Carbon uses for columns.
 *
 * Carbon Charts alluvial does **not** place columns from categoryOrder. It runs
 * d3-sankey on nodes + links, then labels each distinct x0 with the **last**
 * node.category at that x0.
 *
 * Alignment (Carbon `@carbon/charts` Alluvial render):
 * - `nodeAlignment: 'left'`  → sankeyLeft (depth = column)
 * - `nodeAlignment: 'right'` → sankeyRight
 * - anything else (incl. `'center'`) → **sankeyJustify** (Carbon default `nl`)
 *
 * Justify pushes nodes with **no outbound links** to the rightmost column.
 * That is why a leaf file seed (`logger`) co-located under External with
 * packages when we only padded packages and left alignment as center/justify.
 *
 * Hub payloads use **`left`** so Imports file seeds stay on their depth.
 */

import {
	sankey as d3Sankey,
	sankeyJustify,
	sankeyLeft,
	sankeyRight,
	type SankeyGraph,
	type SankeyNode,
} from 'd3-sankey';
import type { AlluvialPayload } from '@core/graph/types.ts';

export type CarbonLayoutNode = {
	name: string;
	category?: string;
	/** d3-sankey graph depth (0 = free-source column). */
	depth: number;
};

export type CarbonLayoutColumn = {
	/** Stable L→R index (0 = leftmost). */
	index: number;
	/** d3-sankey depth for this column. */
	depth: number;
	/**
	 * Column header Carbon would paint - last non-empty category among nodes
	 * at this **x0** (Carbon’s `u[x0] = y.category` overwrite).
	 * For left align, x0 groups match depth; for justify, leaf x0 may differ.
	 */
	header: string | undefined;
	nodes: CarbonLayoutNode[];
};

export type CarbonAlluvialLayout = {
	columns: CarbonLayoutColumn[];
	/** display name → depth */
	depthByName: Map<string, number>;
	/** display name → Carbon header of that node’s **x0 column** (rendered) */
	headerByName: Map<string, string | undefined>;
	/** display name → pixel x0 (relative; compare equality only) */
	x0ByName: Map<string, number>;
	/** Nodes with no inbound link (leftmost free sources). */
	freeSources: string[];
};

type SkNodeExtra = { name: string; category?: string };
type SkLinkExtra = { source: string; target: string; value: number };
type SkNode = SankeyNode<SkNodeExtra, SkLinkExtra>;

/** Map payload nodeAlignment to the d3-sankey align Carbon actually uses. */
export function carbonSankeyAlign(
	nodeAlignment: string | undefined,
): typeof sankeyLeft {
	if (nodeAlignment === 'left') return sankeyLeft;
	if (nodeAlignment === 'right') return sankeyRight;
	// Carbon default + ignored "center" → justify
	if (nodeAlignment === 'center') return sankeyJustify;
	return sankeyJustify;
}

/**
 * Layout an alluvial payload the way `@carbon/charts` Alluvial does.
 * Extent is fixed; assert on column headers / same-x0 co-location, not pixels.
 */
export function layoutAlluvialLikeCarbon(
	payload: AlluvialPayload,
): CarbonAlluvialLayout {
	const nodeInputs: SkNodeExtra[] = payload.options.alluvial.nodes.map((n) => ({
		name: n.name,
		category: n.category,
	}));
	const linkInputs: SkLinkExtra[] = payload.data.map((l) => ({
		source: l.source,
		target: l.target,
		value: l.value,
	}));

	const align = carbonSankeyAlign(payload.options.alluvial.nodeAlignment);

	const layout = d3Sankey<SkNodeExtra, SkLinkExtra>()
		.nodeId((d) => d.name)
		.nodeWidth(4)
		.nodePadding(8)
		.nodeAlign(align)
		.extent([
			[2, 30],
			[800, 400],
		]);

	const graph: SankeyGraph<SkNodeExtra, SkLinkExtra> = layout({
		nodes: nodeInputs.map((n) => ({ ...n })),
		links: linkInputs.map((l) => ({ ...l })),
	});

	// Carbon drops zero-value nodes after layout
	const liveNodes = (graph.nodes as SkNode[]).filter(
		(n) => (n.value ?? 0) !== 0,
	);

	// Carbon headers key by **x0** (not depth) - justify can move leaves right
	const headerByX0 = new Map<number, string | undefined>();
	const nodesByX0 = new Map<number, SkNode[]>();
	for (const n of liveNodes) {
		const x0 = n.x0 ?? 0;
		if (n.category) headerByX0.set(x0, n.category);
		const list = nodesByX0.get(x0) ?? [];
		list.push(n);
		nodesByX0.set(x0, list);
	}

	const x0s = [...nodesByX0.keys()].sort((a, b) => a - b);
	const columns: CarbonLayoutColumn[] = [];
	const depthByName = new Map<string, number>();
	const headerByName = new Map<string, string | undefined>();
	const x0ByName = new Map<string, number>();

	x0s.forEach((x0, index) => {
		const header = headerByX0.get(x0);
		const at = nodesByX0.get(x0) ?? [];
		const outNodes: CarbonLayoutNode[] = at.map((n) => ({
			name: n.name,
			category: n.category,
			depth: n.depth ?? 0,
		}));
		// Representative depth = min depth in column (left: all equal)
		const depth = Math.min(...outNodes.map((n) => n.depth));
		columns.push({ index, depth, header, nodes: outNodes });
		for (const n of outNodes) {
			depthByName.set(n.name, n.depth);
			headerByName.set(n.name, header);
			x0ByName.set(n.name, x0);
		}
	});

	const targets = new Set(payload.data.map((l) => l.target));
	const freeSources = payload.options.alluvial.nodes
		.map((n) => n.name)
		.filter((name) => !targets.has(name));

	return { columns, depthByName, headerByName, x0ByName, freeSources };
}

/** Column header for a display name, or undefined if missing from layout. */
export function carbonColumnHeader(
	layout: CarbonAlluvialLayout,
	name: string,
): string | undefined {
	return layout.headerByName.get(name);
}

/**
 * True when two display names share the same rendered Carbon column (same x0).
 * Prefer this over depth when testing justify-sensitive leaves.
 */
export function carbonSameColumn(
	layout: CarbonAlluvialLayout,
	a: string,
	b: string,
): boolean {
	const xa = layout.x0ByName.get(a);
	const xb = layout.x0ByName.get(b);
	return xa !== undefined && xb !== undefined && xa === xb;
}
