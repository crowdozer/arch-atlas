/**
 * Shared hub construction helpers: link builder shape, display-name claims,
 * edge weight aggregation into/from path sets, proportional mass split.
 */

import type {
	AlluvialNodeRef,
	CodeGraph,
} from '@core/graph/types.ts';
import type { WeightAxis } from '@core/view/alluvial.ts';
import {
	edgeWeight,
	type EdgeWeightOpts,
} from '@core/view/weight.ts';

export type LinkBuilder = {
	graph: CodeGraph;
	weightAxis: WeightAxis;
	/** Exact mass opts (precision + surface); optional for estimate path. */
	edgeWeightOpts?: EdgeWeightOpts;
	fileLabel: string;
	addLink: (source: string, target: string, value: number) => void;
	nodeRef: Record<string, AlluvialNodeRef>;
	nodeMeta: Map<string, { category: string; color: string }>;
	usedNames: Set<string>;
};

/** Claim a display name; append side/kind marker when taken. */
export function claimName(
	usedNames: Set<string>,
	preferred: string,
	fallbackSuffix: string,
): string {
	if (!usedNames.has(preferred)) {
		usedNames.add(preferred);
		return preferred;
	}
	const alt = `${preferred} · ${fallbackSuffix}`;
	if (!usedNames.has(alt)) {
		usedNames.add(alt);
		return alt;
	}
	let n = 2;
	while (usedNames.has(`${alt} ${n}`)) n += 1;
	const final = `${alt} ${n}`;
	usedNames.add(final);
	return final;
}

/**
 * Count file→file edges from `from` into any of `targets` (weight units via edges).
 */
export function edgeWeightIntoSet(
	graph: CodeGraph,
	from: string,
	targets: ReadonlySet<string>,
	weightAxis: WeightAxis,
	edgeWeightOpts?: EdgeWeightOpts,
): number {
	if (!targets.size) return 0;
	let n = 0;
	for (const e of graph.edges) {
		if (e.from !== from || e.toKind !== 'file') continue;
		if (!targets.has(e.to)) continue;
		n += edgeWeight(e, graph, weightAxis, edgeWeightOpts);
	}
	return n;
}

/** Sum edge weights from any of `froms` into `to`. */
export function edgeWeightFromSet(
	graph: CodeGraph,
	froms: ReadonlySet<string>,
	to: string,
	weightAxis: WeightAxis,
	edgeWeightOpts?: EdgeWeightOpts,
): number {
	if (!froms.size) return 0;
	let n = 0;
	for (const e of graph.edges) {
		if (e.toKind !== 'file' || e.to !== to) continue;
		if (!froms.has(e.from)) continue;
		n += edgeWeight(e, graph, weightAxis, edgeWeightOpts);
	}
	return n;
}

/**
 * Integer proportional split of `budget` by raw weights (largest remainder).
 * Keys with raw≤0 are skipped; if all raw≤0, split budget evenly.
 */
export function allocateProportional(
	budget: number,
	items: { key: string; raw: number }[],
): Map<string, number> {
	const out = new Map<string, number>();
	if (budget <= 0 || !items.length) return out;
	const positive = items.filter((it) => it.raw > 0);
	const use = positive.length ? positive : items.map((it) => ({ ...it, raw: 1 }));
	const totalRaw = use.reduce((s, it) => s + it.raw, 0);
	if (totalRaw <= 0) return out;
	let assigned = 0;
	const frac: { key: string; floor: number; rem: number }[] = [];
	for (const it of use) {
		const exact = (budget * it.raw) / totalRaw;
		const floor = Math.floor(exact);
		frac.push({ key: it.key, floor, rem: exact - floor });
		assigned += floor;
	}
	frac.sort((a, b) => b.rem - a.rem || a.key.localeCompare(b.key));
	let left = budget - assigned;
	for (const f of frac) {
		let w = f.floor;
		if (left > 0) {
			w += 1;
			left -= 1;
		}
		if (w > 0) out.set(f.key, (out.get(f.key) ?? 0) + w);
	}
	return out;
}
