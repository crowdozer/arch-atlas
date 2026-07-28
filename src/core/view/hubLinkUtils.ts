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
 * Proportional split of `budget` by raw weights.
 *
 * **Fractional (Phase 1B):** every item with raw>0 receives a positive share when
 * budget>0, so scarce unit-mass fan-out cannot drop uncapped siblings. Shares
 * sum exactly to `budget` (last key absorbs float remainder).
 *
 * Keys with raw≤0 are skipped; if all raw≤0, split budget evenly across items.
 *
 * Previously integer largest-remainder: with budget 1 and n>1 children, n-1 got 0
 * and vanished after unlinked-node prune — topology loss under conservation.
 */
export function allocateProportional(
	budget: number,
	items: { key: string; raw: number }[],
): Map<string, number> {
	const out = new Map<string, number>();
	if (!(budget > 0) || !items.length) return out;
	const positive = items.filter((it) => it.raw > 0);
	const use = positive.length
		? positive
		: items.map((it) => ({ ...it, raw: 1 }));
	const totalRaw = use.reduce((s, it) => s + it.raw, 0);
	if (!(totalRaw > 0)) return out;

	// Stable key order so last-remainder assignment is deterministic
	const ordered = [...use].sort((a, b) => a.key.localeCompare(b.key));
	let assigned = 0;
	for (let i = 0; i < ordered.length; i++) {
		const it = ordered[i]!;
		const share =
			i === ordered.length - 1
				? budget - assigned
				: (budget * it.raw) / totalRaw;
		assigned += share;
		if (share > 0) out.set(it.key, (out.get(it.key) ?? 0) + share);
	}
	return out;
}

/**
 * Equal fractional split of `budget` across keys (scarce-safe equal-raw fan-out).
 * Every key gets budget/n > 0 when budget > 0; sum equals budget exactly.
 */
export function allocateEqual(
	budget: number,
	keys: readonly string[],
): Map<string, number> {
	const out = new Map<string, number>();
	if (!(budget > 0) || !keys.length) return out;
	const ordered = [...keys].sort((a, b) => a.localeCompare(b));
	let assigned = 0;
	for (let i = 0; i < ordered.length; i++) {
		const key = ordered[i]!;
		const share =
			i === ordered.length - 1 ? budget - assigned : budget / ordered.length;
		assigned += share;
		if (share > 0) out.set(key, (out.get(key) ?? 0) + share);
	}
	return out;
}
