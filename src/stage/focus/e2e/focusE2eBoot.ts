/**
 * Browser boot for focus e2e (Artillery-style hook).
 * Mounts real Carbon Alluvial + polish + LogicalFocusGraph apply via shared stage.
 * Exposed as window.__ATLAS_FOCUS_E2E__ from /focus-e2e.
 */
import type { AlluvialPayload } from '@core/graph/types.ts';
import { createAlluvialStage } from '../../mount.ts';
import type { AlluvialFocusApi } from '../bindAlluvialFocus.ts';
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

const stage = createAlluvialStage({
	getRoot: () => document.getElementById('focus-e2e-root'),
	getInteractionMode: () => 'drill',
	onNodeClick: () => {},
	onLineClick: () => {},
	// Deterministic layout for Playwright dumps (matches prior fixed mount).
	getHeightPx: () => 700,
	prepareHolder: (h) => {
		h.style.width = '1200px';
		h.style.height = '720px';
	},
});

let lastKeys: string[] = [];

async function nextFrame(): Promise<void> {
	await new Promise<void>((r) => requestAnimationFrame(() => r()));
	await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function focusApi(): AlluvialFocusApi | null {
	return stage.getFocusApi();
}

function holderEl(): HTMLElement | null {
	return stage.getHolder();
}

function dumpBands(): FocusE2EBandDump[] {
	const holder = holderEl();
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
	const holder = holderEl();
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

	stage.mount(payload);

	// Wait for Carbon layout settle + polish (RENDER_FINISHED may re-polish)
	await nextFrame();
	await new Promise((r) => setTimeout(r, 100));
	// Force one more polish pass via remount-stable reapply path if focus exists
	const api = focusApi();
	api?.bindExternal();
	api?.reapply();
	await nextFrame();
}

async function hoverFile(name: string): Promise<void> {
	const api = focusApi();
	if (!api) throw new Error('loadPayload first');
	const seed: FocusSeed = { kind: 'file', name };
	api.applySeed(seed, null);
	// capture keys from plan via dump after rAF re-paint
	await nextFrame();
	const bands = dumpBands();
	lastKeys = bands.filter((b) => b.focus).map((b) => b.key);
}

async function hoverBand(source: string, target: string): Promise<void> {
	const api = focusApi();
	if (!api) throw new Error('loadPayload first');
	api.applySeed(
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
		clearFocus: () => focusApi()?.clearFocus(),
		dumpBands,
		dumpLabels,
		lastFocusedKeys: () => lastKeys,
	};
	window.__ATLAS_FOCUS_E2E__ = api;
}

boot();
