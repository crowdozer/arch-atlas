/**
 * Thin wire: Carbon + straighten events → planFocus → applyFocusPlan.
 * Graph is built once per payload; rebind after polish reinjects straighten DOM.
 */

import type { AlluvialPayload, AlluvialNodeRef } from '@core/graph/types.ts';
import {
	seedFromCarbonLine,
	seedFromCarbonNode,
	seedFromStraightenData,
	datumNodeName,
} from './displayAdapter.ts';
import { applyFocusPlan, clearFocusPlan } from './focusApply.ts';
import {
	buildLogicalFocusGraph,
	planFocus,
	type FocusPlan,
	type FocusSeed,
	type LogicalFocusGraph,
} from './logicalFocusGraph.ts';

export type DrillResolvers = {
	drillTargetFromNode: (name: string) => string | null;
	drillTargetFromLine: (
		sourceName: string | null,
		targetName: string | null,
	) => string | null;
	handleLineClick: (
		sourceName: string | null,
		targetName: string | null,
	) => void;
};

export type AlluvialFocusApi = {
	graph: LogicalFocusGraph;
	applySeed: (seed: FocusSeed, drillTarget: string | null) => void;
	/** Re-apply last plan after polish (optional). */
	reapply: () => void;
	clearFocus: () => void;
	/** Bind native handlers on straighten paths + External chips. */
	bindExternal: () => void;
};

function detailDatum(e: Event): unknown {
	const ce = e as CustomEvent<{ datum?: unknown }>;
	return ce.detail?.datum ?? ce.detail;
}

/**
 * Create focus API for a mounted holder + payload. Call once per mount.
 */
export function createHubAlluvialFocus(
	holder: HTMLElement,
	payload: AlluvialPayload,
	drill: DrillResolvers,
): AlluvialFocusApi {
	const graph = buildLogicalFocusGraph(payload);
	const nodeRef = payload.meta.nodeRef as Record<string, AlluvialNodeRef>;
	let lastPlan: FocusPlan | null = null;
	let lastDrill: string | null = null;

	const paint = (plan: FocusPlan, drillTarget: string | null) => {
		applyFocusPlan(holder, plan, { nodeRef, drillTarget });
	};

	const applySeed = (seed: FocusSeed, drillTarget: string | null) => {
		const plan = planFocus(graph, seed);
		lastPlan = plan;
		lastDrill = drillTarget;
		paint(plan, drillTarget);
		// Beat Carbon re-dim after paint
		requestAnimationFrame(() => {
			if (lastPlan === plan) paint(plan, drillTarget);
		});
	};

	const clearFocus = () => {
		lastPlan = null;
		lastDrill = null;
		clearFocusPlan(holder);
	};

	const reapply = () => {
		if (!lastPlan) return;
		paint(lastPlan, lastDrill);
	};

	const bindExternal = () => {
		for (const path of holder.querySelectorAll<SVGPathElement>(
			'path.atlas-alluvial-external-straight',
		)) {
			if (path.dataset.atlasBound === '1') continue;
			path.dataset.atlasBound = '1';
			path.addEventListener('mouseenter', () => {
				const d = (path as unknown as { __data__?: unknown }).__data__;
				const seed = seedFromStraightenData(d);
				if (!seed || seed.kind !== 'band') return;
				applySeed(seed, drill.drillTargetFromLine(seed.source, seed.target));
			});
			path.addEventListener('mouseleave', () => {
				clearFocus();
			});
			path.addEventListener('click', (e) => {
				e.stopPropagation();
				const d = (path as unknown as { __data__?: unknown }).__data__;
				const seed = seedFromStraightenData(d);
				if (!seed || seed.kind !== 'band') return;
				drill.handleLineClick(seed.source, seed.target);
			});
		}

		// External package chips: native hover when Carbon events are flaky
		for (const g of holder.querySelectorAll<SVGGElement>('g.node-group')) {
			const d = (
				g as unknown as {
					__data__?: { name?: string; category?: string };
				}
			).__data__;
			if (!d?.name || d.category !== 'External') continue;
			if (g.dataset.atlasExtBound === '1') continue;
			g.dataset.atlasExtBound = '1';
			g.addEventListener('mouseenter', () => {
				const seed = seedFromCarbonNode(graph, d);
				if (!seed) return;
				const name = datumNodeName(d);
				applySeed(seed, name ? drill.drillTargetFromNode(name) : null);
			});
			g.addEventListener('mouseleave', () => {
				clearFocus();
			});
		}
	};

	return { graph, applySeed, reapply, clearFocus, bindExternal };
}

/**
 * Bind Carbon alluvial-node / alluvial-line mouse events to FocusPlan apply.
 */
export function bindHubAlluvialFocusEvents(
	instance: { services?: { events?: EventTarget } },
	focusApi: AlluvialFocusApi,
	drill: DrillResolvers,
): void {
	const events = instance.services?.events;
	if (!events?.addEventListener) return;

	const { graph, applySeed, clearFocus } = focusApi;

	events.addEventListener('alluvial-line-mouseover', ((e: Event) => {
		const datum = detailDatum(e);
		const seed = seedFromCarbonLine(datum);
		if (!seed) return;
		applySeed(seed, drill.drillTargetFromLine(seed.source, seed.target));
	}) as EventListener);

	events.addEventListener('alluvial-line-mouseout', (() => {
		clearFocus();
	}) as EventListener);

	events.addEventListener('alluvial-node-mouseover', ((e: Event) => {
		const datum = detailDatum(e);
		const seed = seedFromCarbonNode(graph, datum);
		if (!seed) return;
		const name = datumNodeName(datum);
		applySeed(seed, name ? drill.drillTargetFromNode(name) : null);
	}) as EventListener);

	events.addEventListener('alluvial-node-mouseout', (() => {
		clearFocus();
	}) as EventListener);
}
