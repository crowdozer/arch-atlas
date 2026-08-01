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

/**
 * Lower-level: direct applySeed (proves paint path only).
 * Prefer {@link hoverFilePhysical} for adapter/DOM binding coverage.
 */
export async function hoverFileApplySeed(
	page: Page,
	name: string,
): Promise<void> {
	await page.evaluate(async (n) => {
		const api = window.__ATLAS_FOCUS_E2E__;
		if (!api) throw new Error('__ATLAS_FOCUS_E2E__ missing');
		await api.hoverFile(n);
	}, name);
}

/** @deprecated use hoverFilePhysical - kept name for call-site clarity in older tests */
export async function hoverFileInBrowser(
	page: Page,
	name: string,
): Promise<void> {
	return hoverFilePhysical(page, name);
}

/**
 * Physical pointer hover on Carbon node-group (Phase 3).
 * Exercises real DOM + Carbon event path; fails if binding is broken even when
 * planFocus would still be correct via applySeed.
 */
export async function hoverFilePhysical(
	page: Page,
	name: string,
): Promise<void> {
	const box = await page.evaluate((n) => {
		const root = document.getElementById('focus-e2e-root');
		if (!root) return null;
		for (const g of root.querySelectorAll<SVGGElement>('g.node-group')) {
			const d = (g as unknown as { __data__?: { name?: string } }).__data__;
			if (d?.name !== n) continue;
			const r = g.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) continue;
			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		}
		return null;
	}, name);
	if (!box) {
		throw new Error(
			`Physical hover: no g.node-group with __data__.name=${JSON.stringify(name)}`,
		);
	}
	await page.mouse.move(box.x, box.y);
	// Allow Carbon event → focus paint + rAF re-paint
	await page.waitForTimeout(150);
	await page.evaluate(async () => {
		const api = window.__ATLAS_FOCUS_E2E__;
		if (!api) return;
		// Sync lastKeys from dump for helpers that read focused keys
		const bands = api.dumpBands();
		// no-op if API lacks hook; dump is enough for assertions
		void bands;
	});
}

/** Physical mouseleave of chart root → clearFocus path. */
export async function leaveChartPhysical(page: Page): Promise<void> {
	const box = await page.evaluate(() => {
		const root = document.getElementById('focus-e2e-root');
		if (!root) return null;
		const r = root.getBoundingClientRect();
		// Move just outside the chart
		return { x: r.x - 20, y: r.y - 20 };
	});
	if (!box) throw new Error('#focus-e2e-root missing for mouseleave');
	await page.mouse.move(box.x, box.y);
	await page.waitForTimeout(150);
}

/**
 * Physical hover on a carbon path.link matching source/target display names.
 */
export async function hoverBandPhysical(
	page: Page,
	source: string,
	targetPrefix: string,
): Promise<void> {
	const box = await page.evaluate(
		({ source: s, targetPrefix: tp }) => {
			const root = document.getElementById('focus-e2e-root');
			if (!root) return null;
			const endName = (end: unknown): string => {
				if (typeof end === 'string') return end;
				if (end && typeof end === 'object' && 'name' in end) {
					const n = (end as { name?: string }).name;
					return typeof n === 'string' ? n : '';
				}
				return '';
			};
			for (const p of root.querySelectorAll<SVGPathElement>('path.link')) {
				if (p.classList.contains('atlas-alluvial-pad-band')) continue;
				const d = (
					p as unknown as {
						__data__?: { source?: unknown; target?: unknown };
					}
				).__data__;
				const src = endName(d?.source);
				const tgt = endName(d?.target);
				if (src === s && tgt.startsWith(tp)) {
					const r = p.getBoundingClientRect();
					if (r.width <= 0 || r.height <= 0) continue;
					return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
				}
			}
			return null;
		},
		{ source, targetPrefix },
	);
	if (!box) {
		throw new Error(
			`Physical hover: no path.link ${source}→${targetPrefix}*`,
		);
	}
	await page.mouse.move(box.x, box.y);
	await page.waitForTimeout(150);
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
