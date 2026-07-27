/**
 * Browser boot for focus e2e (Artillery-style hook).
 * Mounts real Carbon Alluvial + polish + LogicalFocusGraph apply.
 * Exposed as window.__ATLAS_FOCUS_E2E__ from /focus-e2e.
 */
import { AlluvialChart, ChartEvent } from '@carbon/charts';
import '@carbon/charts/styles.css';
import type { AlluvialPayload } from '@core/graph/types.ts';
import { polishAlluvialHolder } from '../../alluvialPolish/index.ts';
import {
	createHubAlluvialFocus,
	type AlluvialFocusApi,
} from '../bindAlluvialFocus.ts';
import type { FocusSeed } from '../logicalFocusGraph.ts';

export type FocusE2EBandDump = {
	source: string;
	target: string;
	key: string;
	focus: boolean;
	dim: boolean;
	straight: boolean;
	className: string;
};

export type FocusE2ELabelDump = {
	name: string;
	focus: boolean;
};

export type AtlasFocusE2E = {
	ready: boolean;
	loadPayload: (payload: AlluvialPayload) => Promise<void>;
	hoverFile: (name: string) => Promise<void>;
	hoverBand: (source: string, target: string) => Promise<void>;
	clearFocus: () => void;
	dumpBands: () => FocusE2EBandDump[];
	dumpLabels: () => FocusE2ELabelDump[];
	/** Last plan focusedBandKeys (string keys with \0). */
	lastFocusedKeys: () => string[];
};

declare global {
	interface Window {
		__ATLAS_FOCUS_E2E__?: AtlasFocusE2E;
	}
}

function endName(end: unknown): string {
	if (typeof end === 'string') return end;
	if (end && typeof end === 'object' && 'name' in end) {
		const n = (end as { name?: string }).name;
		return typeof n === 'string' ? n : '';
	}
	return '';
}

function noopDrill() {
	return {
		drillTargetFromNode: () => null,
		drillTargetFromLine: () => null,
		handleLineClick: () => {},
	};
}

let chart: InstanceType<typeof AlluvialChart> | null = null;
let focusApi: AlluvialFocusApi | null = null;
let holder: HTMLElement | null = null;
let lastKeys: string[] = [];

async function nextFrame(): Promise<void> {
	await new Promise<void>((r) => requestAnimationFrame(() => r()));
	await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function dumpBands(): FocusE2EBandDump[] {
	if (!holder) return [];
	const out: FocusE2EBandDump[] = [];
	for (const p of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const straight = p.classList.contains('atlas-alluvial-external-straight');
		if (p.classList.contains('atlas-alluvial-pad-band')) continue;
		const d = (p as unknown as { __data__?: { source?: unknown; target?: unknown } })
			.__data__;
		const source = endName(d?.source);
		const target = endName(d?.target);
		if (!source || !target) continue;
		const key = straight ? `ext:${source}\0${target}` : `${source}\0${target}`;
		out.push({
			source,
			target,
			key,
			focus: straight
				? p.classList.contains('atlas-alluvial-external-straight--focus')
				: p.classList.contains('atlas-alluvial-carbon-link-focus'),
			dim: straight
				? false
				: p.classList.contains('atlas-alluvial-carbon-link-dim'),
			straight,
			className: p.getAttribute('class') ?? '',
		});
	}
	return out;
}

function dumpLabels(): FocusE2ELabelDump[] {
	if (!holder) return [];
	const out: FocusE2ELabelDump[] = [];
	for (const g of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = (g as unknown as { __data__?: { name?: string } }).__data__;
		const name = d?.name;
		if (!name) continue;
		out.push({
			name,
			focus: g.classList.contains('ui-alluvial-label-focus'),
		});
	}
	return out;
}

async function loadPayload(payload: AlluvialPayload): Promise<void> {
	const root = document.getElementById('focus-e2e-root');
	if (!root) throw new Error('#focus-e2e-root missing');

	if (chart) {
		try {
			(chart as unknown as { destroy?: () => void }).destroy?.();
		} catch {
			/* ignore */
		}
		chart = null;
	}
	focusApi = null;
	root.replaceChildren();

	holder = document.createElement('div');
	holder.className = 'ui-carbon-chart__holder atlas-stage__holder';
	holder.style.width = '1200px';
	holder.style.height = '720px';
	root.appendChild(holder);

	const options = {
		...payload.options,
		height: '700px',
		animations: false,
	};

	chart = new AlluvialChart(holder, {
		data: payload.data,
		options,
	});

	const drill = noopDrill();
	focusApi = createHubAlluvialFocus(holder, payload, drill);

	const applyPolish = () => {
		if (!holder || !chart) return;
		polishAlluvialHolder(holder, {
			colorScale: payload.options.color.scale,
			terminators: payload.meta.terminators,
			exportTerminators: payload.meta.exportTerminators,
			externalStraightPairs: payload.meta.externalStraightPairs,
		});
		focusApi?.bindExternal();
		focusApi?.reapply();
	};

	applyPolish();
	const events = (
		chart as unknown as { services?: { events?: EventTarget } }
	).services?.events;
	events?.addEventListener?.(ChartEvent.RENDER_FINISHED, applyPolish);

	// Wait for Carbon layout settle + polish
	await nextFrame();
	await new Promise((r) => setTimeout(r, 100));
	applyPolish();
	await nextFrame();
}

async function hoverFile(name: string): Promise<void> {
	if (!focusApi) throw new Error('loadPayload first');
	const seed: FocusSeed = { kind: 'file', name };
	focusApi.applySeed(seed, null);
	// capture keys from plan via dump after rAF re-paint
	await nextFrame();
	const bands = dumpBands();
	lastKeys = bands.filter((b) => b.focus).map((b) => b.key);
}

async function hoverBand(source: string, target: string): Promise<void> {
	if (!focusApi) throw new Error('loadPayload first');
	focusApi.applySeed(
		{ kind: 'band', source, target, display: 'carbon' },
		null,
	);
	await nextFrame();
	lastKeys = dumpBands().filter((b) => b.focus).map((b) => b.key);
}

function boot(): void {
	const api: AtlasFocusE2E = {
		ready: true,
		loadPayload,
		hoverFile,
		hoverBand,
		clearFocus: () => focusApi?.clearFocus(),
		dumpBands,
		dumpLabels,
		lastFocusedKeys: () => lastKeys,
	};
	window.__ATLAS_FOCUS_E2E__ = api;
}

boot();
