/**
 * Post-Carbon alluvial geometry — same topology Carbon uses for columns.
 *
 * Carbon Charts alluvial does **not** place columns from categoryOrder. It runs
 * d3-sankey on nodes + links, then labels each distinct x0 with the **last**
 * node.category at that x0. Payload membership tests can pass while the chart
 * still mis-headers (e.g. Imports file seed co-located with External packages).
 *
 * Use this helper in goldens so layout regressions match the rendered chart.
 */

import {
	sankey as d3Sankey,
	sankeyCenter,
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
	 * Column header Carbon would paint — last non-empty category among nodes
	 * at this depth (matches Carbon’s `u[x0] = y.category` overwrite).
	 */
	header: string | undefined;
	nodes: CarbonLayoutNode[];
};

export type CarbonAlluvialLayout = {
	columns: CarbonLayoutColumn[];
	/** display name → depth */
	depthByName: Map<string, number>;
	/** display name → Carbon header of that node’s column */
	headerByName: Map<string, string | undefined>;
	/** Nodes with no inbound link (leftmost free sources). */
	freeSources: string[];
};

type SkNodeExtra = { name: string; category?: string };
type SkLinkExtra = { source: string; target: string; value: number };
type SkNode = SankeyNode<SkNodeExtra, SkLinkExtra>;

/**
 * Layout an alluvial payload the way `@carbon/charts` Alluvial does:
 * d3-sankey + center align + last-category-wins headers per column.
 *
 * Extent is fixed; only **depth / column index** are meaningful for tests
 * (not pixel x0).
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

	// Carbon: nodeId = name, nodeAlign = center when nodeAlignment is center
	const layout = d3Sankey<SkNodeExtra, SkLinkExtra>()
		.nodeId((d) => d.name)
		.nodeWidth(4)
		.nodePadding(8)
		.nodeAlign(sankeyCenter)
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

	// Group by depth (stable column identity; x0 is width-dependent)
	const byDepth = new Map<number, SkNode[]>();
	for (const n of liveNodes) {
		const d = n.depth ?? 0;
		const list = byDepth.get(d) ?? [];
		list.push(n);
		byDepth.set(d, list);
	}

	const depths = [...byDepth.keys()].sort((a, b) => a - b);
	const columns: CarbonLayoutColumn[] = [];
	const depthByName = new Map<string, number>();
	const headerByName = new Map<string, string | undefined>();

	// Carbon: forEach nodes in layout order; last category at each x0 wins.
	// We key by depth (same column for co-located nodes).
	const headerByDepth = new Map<number, string | undefined>();
	for (const n of liveNodes) {
		const d = n.depth ?? 0;
		if (n.category) headerByDepth.set(d, n.category);
	}

	depths.forEach((depth, index) => {
		const header = headerByDepth.get(depth);
		const outNodes: CarbonLayoutNode[] = (byDepth.get(depth) ?? []).map(
			(n) => ({
				name: n.name,
				category: n.category,
				depth,
			}),
		);
		columns.push({ index, depth, header, nodes: outNodes });
		for (const n of outNodes) {
			depthByName.set(n.name, depth);
			headerByName.set(n.name, header);
		}
	});

	const targets = new Set(payload.data.map((l) => l.target));
	const freeSources = payload.options.alluvial.nodes
		.map((n) => n.name)
		.filter((name) => !targets.has(name));

	return { columns, depthByName, headerByName, freeSources };
}

/** Column header for a display name, or undefined if missing from layout. */
export function carbonColumnHeader(
	layout: CarbonAlluvialLayout,
	name: string,
): string | undefined {
	return layout.headerByName.get(name);
}

/** True when two display names share the same d3-sankey depth (same Carbon column). */
export function carbonSameColumn(
	layout: CarbonAlluvialLayout,
	a: string,
	b: string,
): boolean {
	const da = layout.depthByName.get(a);
	const db = layout.depthByName.get(b);
	return da !== undefined && db !== undefined && da === db;
}
