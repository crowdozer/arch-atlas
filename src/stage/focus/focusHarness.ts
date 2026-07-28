/**
 * Focus observation harness — pure data dump of what would light / dim.
 *
 * Layers (no Carbon mount):
 *  1. FocusPlan (logical SoR)
 *  2. Drawn inventory (post-polish simulation from payload)
 *  3. classifyDrawnBands → every drawn band is focus|dim
 *  4. Optional MiniEl apply → CSS class contract on those paths
 *
 * Product invariant pin (codebreaker Buffer hover):
 *  - Buffer→useCodebreaker→deps: focus
 *  - sibling index→useCodebreaker: dim
 *
 * Law: .grok/reference/hub-focus-behavior.md
 */

import type { AlluvialPayload } from '@core/graph/types.ts';
import {
	listDrawnBandsFromPayload,
	type DrawnBand,
	type DrawnInventory,
} from './displayInventory.ts';
import {
	applyFocusPlan,
	CLASS_CARBON_DIM,
	CLASS_CARBON_FOCUS,
	CLASS_LABEL_FOCUS,
	CLASS_STRAIGHT_FOCUS,
	classifyDrawnBands,
} from './focusApply.ts';
import {
	buildLogicalFocusGraph,
	externalBandKey,
	fileBandKey,
	planFocus,
	type FocusPlan,
	type FocusSeed,
	type LogicalFocusGraph,
} from './logicalFocusGraph.ts';

// —— types ————————————————————————————————————————————————————————————————

export type BandPaint = 'focus' | 'dim' | 'absent';

export type FocusObservation = {
	seed: FocusSeed;
	plan: FocusPlan;
	graph: LogicalFocusGraph;
	inventory: DrawnInventory;
	/** Every inventory band → focus|dim (no third state). */
	classification: ReadonlyMap<string, 'focus' | 'dim'>;
	activeLabels: readonly string[];
	focusedBandKeys: readonly string[];
	dimBandKeys: readonly string[];
	focusedDrawn: readonly DrawnBand[];
	dimDrawn: readonly DrawnBand[];
};

export type AppliedBandRow = {
	key: string;
	source: string;
	target: string;
	kind: 'carbon' | 'straighten';
	focus: boolean;
	dim: boolean;
};

export type AppliedObservation = {
	holderDimming: boolean;
	labelsFocus: readonly string[];
	bands: readonly AppliedBandRow[];
};

// —— observe (plan + inventory) ————————————————————————————————————————————

/**
 * Build FocusPlan for a seed and classify every **drawn** band under that plan.
 * This is the primary harness entry — same keys applyFocusPlan uses when
 * Carbon `__data__.name` matches payload display names.
 */
export function observeHubFocus(
	payload: Pick<AlluvialPayload, 'data' | 'meta' | 'options'>,
	seed: FocusSeed,
): FocusObservation {
	const graph = buildLogicalFocusGraph(payload as AlluvialPayload);
	const plan = planFocus(graph, seed);
	const inventory = listDrawnBandsFromPayload(payload);
	const classification = classifyDrawnBands(plan, inventory);

	const focusedBandKeys = [...plan.focusedBandKeys].sort();
	const dimBandKeys = inventory.bands
		.filter((b) => classification.get(b.key) === 'dim')
		.map((b) => b.key)
		.sort();
	const focusedDrawn = inventory.bands.filter(
		(b) => classification.get(b.key) === 'focus',
	);
	const dimDrawn = inventory.bands.filter(
		(b) => classification.get(b.key) === 'dim',
	);

	return {
		seed,
		plan,
		graph,
		inventory,
		classification,
		activeLabels: [...plan.activeLabels].sort(),
		focusedBandKeys,
		dimBandKeys,
		focusedDrawn,
		dimDrawn,
	};
}

/** File-band paint on the drawn inventory (absent if not drawn). */
export function drawnFileBandPaint(
	obs: FocusObservation,
	source: string,
	target: string,
): BandPaint {
	const key = fileBandKey(source, target);
	const state = obs.classification.get(key);
	if (!state) return 'absent';
	return state;
}

/** Any drawn file band whose source/target match predicates. */
export function findDrawnFileBands(
	obs: FocusObservation,
	pred: (source: string, target: string, paint: 'focus' | 'dim') => boolean,
): DrawnBand[] {
	return obs.inventory.bands.filter((b) => {
		if (b.kind !== 'carbon') return false;
		const paint = obs.classification.get(b.key);
		if (paint !== 'focus' && paint !== 'dim') return false;
		return pred(b.source, b.target, paint);
	});
}

/**
 * True if any drawn carbon band source→target* is focused where target
 * starts with `targetPrefix` (multi-instance #N).
 */
export function hasFocusedDrawnEdge(
	obs: FocusObservation,
	source: string,
	targetPrefix: string,
): boolean {
	return obs.inventory.bands.some((b) => {
		if (b.kind !== 'carbon') return false;
		if (b.source !== source) return false;
		if (!b.target.startsWith(targetPrefix)) return false;
		return obs.classification.get(b.key) === 'focus';
	});
}

export function hasDimDrawnEdge(
	obs: FocusObservation,
	source: string,
	targetPrefix: string,
): boolean {
	return obs.inventory.bands.some((b) => {
		if (b.kind !== 'carbon') return false;
		if (b.source !== source) return false;
		if (!b.target.startsWith(targetPrefix)) return false;
		return obs.classification.get(b.key) === 'dim';
	});
}

/** Every inventory band classified (no missing keys). */
export function assertCompleteClassification(obs: FocusObservation): void {
	for (const b of obs.inventory.bands) {
		const s = obs.classification.get(b.key);
		if (s !== 'focus' && s !== 'dim') {
			throw new Error(`band ${b.key} not focus|dim`);
		}
	}
}

// —— MiniEl apply observation ——————————————————————————————————————————————

/** Minimal Element surface for applyFocusPlan / listDrawnBandsFromHolder. */
export class HarnessEl {
	tagName: string;
	classList: HarnessClassList;
	children: HarnessEl[] = [];
	parentElement: HarnessEl | null = null;
	textContent = '';
	style: {
		display?: string;
		strokeOpacity?: string;
		fillOpacity?: string;
		opacity?: string;
		removeProperty?: (p: string) => void;
	};
	attrs = new Map<string, string>();
	__data__?: unknown;
	id = '';
	dataset: Record<string, string> = {};

	constructor(tag: string, classNames: string[] = []) {
		this.tagName = tag.toUpperCase();
		this.classList = new HarnessClassList(classNames);
		const style: HarnessEl['style'] = {};
		style.removeProperty = (p: string) => {
			if (p === 'stroke-opacity') delete style.strokeOpacity;
			if (p === 'fill-opacity') delete style.fillOpacity;
			if (p === 'opacity') delete style.opacity;
		};
		this.style = style;
	}

	appendChild(child: HarnessEl): HarnessEl {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value);
		if (name === 'id') this.id = value;
	}

	querySelectorAll(sel: string): HarnessEl[] {
		return this.collect().filter((el) => el.matches(sel));
	}

	querySelector(sel: string): HarnessEl | null {
		return this.querySelectorAll(sel)[0] ?? null;
	}

	private collect(): HarnessEl[] {
		const out: HarnessEl[] = [];
		const walk = (el: HarnessEl) => {
			for (const c of el.children) {
				out.push(c);
				walk(c);
			}
		};
		walk(this);
		return out;
	}

	matches(sel: string): boolean {
		if (sel === 'g.node-group') {
			return this.tagName === 'G' && this.classList.contains('node-group');
		}
		if (sel === 'path.link') {
			return this.tagName === 'PATH' && this.classList.contains('link');
		}
		if (sel === 'path.atlas-alluvial-external-straight') {
			return (
				this.tagName === 'PATH' &&
				this.classList.contains('atlas-alluvial-external-straight')
			);
		}
		if (sel === 'text.node-text') {
			return this.tagName === 'TEXT' && this.classList.contains('node-text');
		}
		if (sel.startsWith('g[id*=')) {
			const needle = sel.match(/id\*="([^"]+)"/)?.[1] ?? '';
			return this.tagName === 'G' && this.id.includes(needle);
		}
		return false;
	}
}

class HarnessClassList {
	private set = new Set<string>();
	constructor(initial: string[] = []) {
		for (const c of initial) this.set.add(c);
	}
	add(...tokens: string[]): void {
		for (const t of tokens) if (t) this.set.add(t);
	}
	remove(...tokens: string[]): void {
		for (const t of tokens) this.set.delete(t);
	}
	contains(token: string): boolean {
		return this.set.has(token);
	}
	toggle(token: string, force?: boolean): boolean {
		const on = force !== undefined ? force : !this.set.has(token);
		if (on) this.set.add(token);
		else this.set.delete(token);
		return on;
	}
}

/**
 * Build a MiniEl-like holder from drawn inventory + label names.
 * Mirrors post-polish DOM keys applyFocusPlan expects.
 */
export function holderFromInventory(
	inventory: DrawnInventory,
	labelNames: Iterable<string>,
): HarnessEl {
	const holder = new HarnessEl('div', ['ui-carbon-chart']);
	const svg = new HarnessEl('svg', []);
	holder.appendChild(svg);

	for (const name of labelNames) {
		const g = new HarnessEl('g', ['node-group']);
		g.__data__ = { name };
		const title = new HarnessEl('g', []);
		title.id = `alluvial-node-title-${name}`;
		title.setAttribute('id', title.id);
		const text = new HarnessEl('text', ['node-text']);
		text.textContent = name;
		title.appendChild(text);
		g.appendChild(title);
		svg.appendChild(g);
	}

	for (const b of inventory.bands) {
		if (b.kind === 'straighten') {
			const p = new HarnessEl('path', [
				'link',
				'atlas-alluvial-external-straight',
			]);
			p.__data__ = {
				source: { name: b.source },
				target: { name: b.target },
			};
			svg.appendChild(p);
		} else {
			const p = new HarnessEl('path', ['link']);
			p.__data__ = {
				source: { name: b.source },
				target: { name: b.target },
			};
			svg.appendChild(p);
		}
	}

	return holder;
}

/**
 * Apply plan to a harness holder and dump class state (observable CSS contract).
 */
export function observeAppliedFocus(
	holder: HarnessEl,
	plan: FocusPlan,
	nodeRef?: Record<string, { kind: string; id: string }>,
): AppliedObservation {
	applyFocusPlan(holder as unknown as HTMLElement, plan, {
		nodeRef: nodeRef as never,
	});

	const labelsFocus: string[] = [];
	for (const g of holder.querySelectorAll('g.node-group')) {
		if (!g.classList.contains(CLASS_LABEL_FOCUS)) continue;
		const d = g.__data__ as { name?: string } | undefined;
		if (d?.name) labelsFocus.push(d.name);
	}

	const bands: AppliedBandRow[] = [];
	for (const p of holder.querySelectorAll('path.link')) {
		const isStraight = p.classList.contains('atlas-alluvial-external-straight');
		const d = p.__data__ as
			| { source?: { name?: string }; target?: { name?: string } }
			| undefined;
		const sn = d?.source?.name ?? '';
		const tn = d?.target?.name ?? '';
		if (!sn || !tn) continue;
		const key = isStraight ? externalBandKey(sn, tn) : fileBandKey(sn, tn);
		bands.push({
			key,
			source: sn,
			target: tn,
			kind: isStraight ? 'straighten' : 'carbon',
			focus: isStraight
				? p.classList.contains(CLASS_STRAIGHT_FOCUS)
				: p.classList.contains(CLASS_CARBON_FOCUS),
			dim: isStraight ? false : p.classList.contains(CLASS_CARBON_DIM),
		});
	}

	return {
		holderDimming: holder.classList.contains('ui-alluvial-label-dimming'),
		labelsFocus: labelsFocus.sort(),
		bands,
	};
}

/**
 * Full pipeline: observe plan+inventory, build holder, apply, return both.
 */
export function observeHubFocusApplied(
	payload: Pick<AlluvialPayload, 'data' | 'meta' | 'options'>,
	seed: FocusSeed,
): { observation: FocusObservation; applied: AppliedObservation } {
	const observation = observeHubFocus(payload, seed);
	const labels = new Set<string>([
		...observation.activeLabels,
		...observation.inventory.bands.flatMap((b) => [b.source, b.target]),
	]);
	// Include all nodeRef keys so dim labels still exist in the tree
	for (const name of Object.keys(payload.meta.nodeRef ?? {})) {
		labels.add(name);
	}
	const holder = holderFromInventory(observation.inventory, labels);
	const applied = observeAppliedFocus(
		holder,
		observation.plan,
		payload.meta.nodeRef as never,
	);
	return { observation, applied };
}

export { fileBandKey, externalBandKey, classifyDrawnBands, listDrawnBandsFromPayload };
