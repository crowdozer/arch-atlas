/**
 * Alluvial stage factory: Carbon chart lifecycle + polish + focus + clicks.
 * Host injects root, interaction mode, and click outcomes (nav/inspect stay host).
 */

import { AlluvialChart } from '@carbon/charts';
import '@carbon/charts/styles.css';
import type { AlluvialNodeRef, AlluvialPayload } from '@core/graph/types.ts';
import type { InteractionMode } from '@shell/types.ts';
import {
	bindAlluvialClicks,
	bindAlluvialRenderPolish,
} from './carbonEvents.ts';
import {
	drillTargetFromLine,
	drillTargetFromNode,
} from './drill.ts';
import {
	bindHubAlluvialFocusEvents,
	createHubAlluvialFocus,
	type AlluvialFocusApi,
	type DrillResolvers,
} from './focus/bindAlluvialFocus.ts';
import { alluvialHeightPx } from './height.ts';
import { polishAlluvialHolder } from './polish/index.ts';

export type AlluvialStageHost = {
	getRoot: () => HTMLElement | null;
	getInteractionMode: () => InteractionMode;
	onNodeClick: (name: string) => void;
	onLineClick: (source: string | null, target: string | null) => void;
	/**
	 * Chart height in px. Default: {@link alluvialHeightPx}.
	 * E2e may pass a fixed height so layout is deterministic.
	 */
	getHeightPx?: (root: HTMLElement) => number;
	/** Optional holder DOM prep (e.g. e2e fixed width/height styles). */
	prepareHolder?: (holder: HTMLElement) => void;
};

export type AlluvialStage = {
	mount(payload: AlluvialPayload | null): void;
	destroy(): void;
	/** Clear chart + empty root + drop payload (resetSession). */
	clear(): void;
	/**
	 * Destroy chart and show a loading status in the stage (Program enrich).
	 * Message is set via textContent (never raw HTML).
	 */
	showLoading(message: string): void;
	getPayload(): AlluvialPayload | null;
	refForName(name: string): AlluvialNodeRef | null;
	/** After successful payload mount; used by focus e2e hover/dump. */
	getFocusApi(): AlluvialFocusApi | null;
	/** Holder element after mount (e2e dumps). */
	getHolder(): HTMLElement | null;
};

/**
 * Create a stage instance bound to host callbacks.
 * Chart + last payload are private; host never holds the Carbon instance.
 */
export function createAlluvialStage(host: AlluvialStageHost): AlluvialStage {
	let chart: InstanceType<typeof AlluvialChart> | null = null;
	let currentPayload: AlluvialPayload | null = null;
	let focusApi: AlluvialFocusApi | null = null;
	let holder: HTMLElement | null = null;

	const destroy = (): void => {
		if (!chart) return;
		try {
			chart.destroy();
		} catch {
			/* Carbon can throw if holder already gone */
		}
		chart = null;
		focusApi = null;
		holder = null;
	};

	const refForName = (name: string): AlluvialNodeRef | null =>
		currentPayload?.meta.nodeRef[name] ?? null;

	const mount = (payload: AlluvialPayload | null): void => {
		const root = host.getRoot();
		if (!root) return;

		destroy();
		// Always replace holder DOM — Carbon leaves residual SVG if only innerHTML clear.
		root.classList.remove('atlas-stage__chart--loading');
		root.replaceChildren();
		currentPayload = payload;

		const nextHolder = document.createElement('div');
		nextHolder.className = 'ui-carbon-chart__holder atlas-stage__holder';
		nextHolder.setAttribute('data-carbon-chart-holder', '');
		host.prepareHolder?.(nextHolder);
		root.appendChild(nextHolder);
		holder = nextHolder;

		if (!payload) {
			nextHolder.innerHTML = `<p class="ui-carbon-chart__loading">No import flow for this start.</p>`;
			return;
		}

		try {
			const heightPx = host.getHeightPx
				? host.getHeightPx(root)
				: alluvialHeightPx(root);
			const options = {
				...payload.options,
				height: `${heightPx}px`,
				animations: false,
			};
			chart = new AlluvialChart(nextHolder, {
				data: payload.data,
				options,
			});
			const colorScale = payload.options.color.scale;
			const terminators = payload.meta.terminators;
			const exportTerminators = payload.meta.exportTerminators;
			const externalStraightPairs = payload.meta.externalStraightPairs;

			const drill: DrillResolvers = {
				drillTargetFromNode: (name) =>
					drillTargetFromNode(name, host.getInteractionMode(), refForName),
				drillTargetFromLine: (source, target) =>
					drillTargetFromLine(
						source,
						target,
						host.getInteractionMode(),
						refForName,
					),
				handleLineClick: host.onLineClick,
			};
			const nextFocus = createHubAlluvialFocus(nextHolder, payload, drill);
			focusApi = nextFocus;

			const applyPolish = () => {
				// Chart may have been destroyed between schedule and fire.
				if (!chart) return;
				polishAlluvialHolder(nextHolder, {
					colorScale,
					terminators,
					exportTerminators,
					externalStraightPairs,
				});
				// Straighten paths are re-injected each polish — rebind hit targets.
				nextFocus.bindExternal();
				// Re-apply active plan if hover survived polish.
				nextFocus.reapply();
			};
			// Immediate pass for the constructor paint; re-apply on every later paint.
			applyPolish();
			bindAlluvialRenderPolish(chart, applyPolish);
			bindAlluvialClicks(chart, {
				onNodeClick: host.onNodeClick,
				onLineClick: host.onLineClick,
			});
			bindHubAlluvialFocusEvents(chart, nextFocus, drill);
		} catch (err) {
			console.error('[atlas] alluvial mount failed', err);
			nextHolder.innerHTML = `<p class="ui-carbon-chart__loading">Chart failed to load.</p>`;
			chart = null;
			focusApi = null;
		}
	};

	const clear = (): void => {
		destroy();
		currentPayload = null;
		const root = host.getRoot();
		if (root) {
			root.classList.remove('atlas-stage__chart--loading');
			root.replaceChildren();
		}
	};

	/**
	 * Tear down the chart and inject a polite loading status so the prior
	 * alluvial is not left on screen during async Program enrich.
	 */
	const showLoading = (message: string): void => {
		destroy();
		currentPayload = null;
		const root = host.getRoot();
		if (!root) return;
		root.replaceChildren();
		root.classList.add('atlas-stage__chart--loading');
		const p = document.createElement('p');
		p.className = 'ui-carbon-chart__loading';
		p.setAttribute('role', 'status');
		p.setAttribute('aria-live', 'polite');
		p.textContent = message;
		root.appendChild(p);
	};

	return {
		mount,
		destroy,
		clear,
		showLoading,
		getPayload: () => currentPayload,
		refForName,
		getFocusApi: () => focusApi,
		getHolder: () => holder,
	};
}
