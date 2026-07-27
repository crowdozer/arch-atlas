import type { Page } from 'playwright';
import type { AlluvialPayload } from '@core/graph/types.ts';
import type { FocusE2EBandDump, FocusE2ELabelDump } from './focusE2eBoot.ts';

export const E2E_READY_TIMEOUT_MS = 60_000;

export async function waitForFocusE2EReady(page: Page): Promise<void> {
	await page.waitForFunction(
		() => window.__ATLAS_FOCUS_E2E__?.ready === true,
		undefined,
		{ timeout: E2E_READY_TIMEOUT_MS },
	);
}

export async function loadHubPayload(
	page: Page,
	payload: AlluvialPayload,
): Promise<void> {
	// Must be structured-clone / JSON safe (no tooltip functions).
	const safe = JSON.parse(
		JSON.stringify(payload, (_k, v) =>
			typeof v === 'function' ? undefined : v,
		),
	) as AlluvialPayload;
	await page.evaluate(async (p) => {
		const api = window.__ATLAS_FOCUS_E2E__;
		if (!api) throw new Error('__ATLAS_FOCUS_E2E__ missing');
		await api.loadPayload(p as AlluvialPayload);
	}, safe as never);
}

export async function hoverFileInBrowser(
	page: Page,
	name: string,
): Promise<void> {
	await page.evaluate(async (n) => {
		const api = window.__ATLAS_FOCUS_E2E__;
		if (!api) throw new Error('__ATLAS_FOCUS_E2E__ missing');
		await api.hoverFile(n);
	}, name);
}

export async function dumpBandsInBrowser(
	page: Page,
): Promise<FocusE2EBandDump[]> {
	return page.evaluate(() => {
		const api = window.__ATLAS_FOCUS_E2E__;
		if (!api) throw new Error('__ATLAS_FOCUS_E2E__ missing');
		return api.dumpBands();
	});
}

export async function dumpLabelsInBrowser(
	page: Page,
): Promise<FocusE2ELabelDump[]> {
	return page.evaluate(() => {
		const api = window.__ATLAS_FOCUS_E2E__;
		if (!api) throw new Error('__ATLAS_FOCUS_E2E__ missing');
		return api.dumpLabels();
	});
}

export function bandFocused(
	bands: FocusE2EBandDump[],
	source: string,
	targetPrefix: string,
): boolean {
	return bands.some(
		(b) =>
			!b.straight &&
			b.source === source &&
			b.target.startsWith(targetPrefix) &&
			b.focus,
	);
}

export function bandDimmed(
	bands: FocusE2EBandDump[],
	source: string,
	targetPrefix: string,
): boolean {
	return bands.some(
		(b) =>
			!b.straight &&
			b.source === source &&
			b.target.startsWith(targetPrefix) &&
			b.dim,
	);
}
