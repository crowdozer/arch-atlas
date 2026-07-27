/**
 * Carbon alluvial event helpers: datum parse, RENDER_FINISHED polish, click bind.
 */

import { ChartEvent } from '@carbon/charts';

type CarbonChartInstance = {
	services?: { events?: EventTarget };
};

/** Extract node display name from Carbon alluvial event datum. */
export function datumName(raw: unknown): string | null {
	if (typeof raw === 'string') return raw;
	if (raw && typeof raw === 'object') {
		const o = raw as Record<string, unknown>;
		if (typeof o.name === 'string') return o.name;
	}
	return null;
}

export function linkEndpointName(end: unknown): string | null {
	if (typeof end === 'string') return end;
	if (end && typeof end === 'object') {
		const o = end as Record<string, unknown>;
		if (typeof o.name === 'string') return o.name;
		// sankey may nest source/target as node objects
		if (o.source !== undefined || o.target !== undefined) return null;
	}
	return null;
}

/** Re-polish after Carbon repaints (resize / model update wipe our DOM classes). */
export function bindAlluvialRenderPolish(
	instance: CarbonChartInstance,
	applyPolish: () => void,
): void {
	const events = instance.services?.events;
	if (!events?.addEventListener) return;
	events.addEventListener(ChartEvent.RENDER_FINISHED, applyPolish);
}

export type AlluvialClickHandlers = {
	onNodeClick: (name: string) => void;
	onLineClick: (source: string | null, target: string | null) => void;
};

export function bindAlluvialClicks(
	instance: CarbonChartInstance,
	handlers: AlluvialClickHandlers,
): void {
	const events = instance.services?.events;
	if (!events?.addEventListener) return;

	events.addEventListener('alluvial-node-click', ((e: Event) => {
		const detail = (e as CustomEvent).detail as {
			datum?: { name?: string };
		} | null;
		const name = datumName(detail?.datum);
		if (name) handlers.onNodeClick(name);
	}) as EventListener);

	events.addEventListener('alluvial-line-click', ((e: Event) => {
		const detail = (e as CustomEvent).detail as {
			datum?: { source?: unknown; target?: unknown };
		} | null;
		const source = linkEndpointName(detail?.datum?.source);
		const target = linkEndpointName(detail?.datum?.target);
		if (source || target) handlers.onLineClick(source, target);
	}) as EventListener);
}
