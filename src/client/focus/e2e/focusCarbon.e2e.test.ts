/**
 * Browser e2e (Artillery pattern): real Carbon Alluvial + polish + focus apply.
 * Not in default `npm test` — run `npm run test:e2e:focus`.
 *
 * Pins the screenshot invariant on **painted** path classes:
 * Buffer hover → Buffer→hook focus; sibling index→hook dim.
 */
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildCodebreakerPageHubPayload,
	CODEBREAKER_BUFFER,
	CODEBREAKER_HOOK,
	CODEBREAKER_INDEX,
	CODEBREAKER_PAGE,
} from './buildCodebreakerPayload.ts';
import {
	bandDimmed,
	bandFocused,
	dumpBandsInBrowser,
	dumpLabelsInBrowser,
	hoverFileInBrowser,
	loadHubPayload,
	waitForFocusE2EReady,
} from './e2eHelpers.ts';
import { startAstroDevServer, type AstroDevServer } from './e2eServer.ts';

describe('focus Carbon e2e (codebreaker Buffer sibling track)', () => {
	let server: AstroDevServer;
	let browser: Browser;
	let baseUrl: string;
	// Built once in Node; stripped of functions before browser inject.
	const payload = buildCodebreakerPageHubPayload();

	beforeAll(async () => {
		// Isolated preview — never attaches to user's :4321 main checkout.
		server = await startAstroDevServer();
		baseUrl = server.baseUrl;
		browser = await chromium.launch();
	}, 180_000);

	afterAll(async () => {
		await browser?.close();
		await server?.stop();
	});

	it('Buffer hover: Buffer→hook focus; sibling index→hook dim on real SVG', async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				// surface Carbon errors in failure output
				console.error('[browser]', msg.text());
			}
		});

		try {
			// Static export lives at /focus-e2e/
			await page.goto(`${baseUrl}/focus-e2e/`, {
				waitUntil: 'networkidle',
				timeout: 60_000,
			});
			try {
				await waitForFocusE2EReady(page);
			} catch (err) {
				const status = await page.locator('#focus-e2e-status').textContent();
				const body = await page.content();
				throw new Error(
					`Focus e2e not ready (status text=${status})\nURL=${page.url()}\n${String(err)}\nHTML head: ${body.slice(0, 500)}`,
				);
			}
			await loadHubPayload(page, payload);

			// Sanity: Carbon drew paths
			const before = await dumpBandsInBrowser(page);
			expect(before.length, 'Carbon drew path.link bands').toBeGreaterThan(5);

			await hoverFileInBrowser(page, CODEBREAKER_BUFFER);
			const bands = await dumpBandsInBrowser(page);
			const labels = await dumpLabelsInBrowser(page);

			// Expected path
			expect(
				bandFocused(bands, CODEBREAKER_BUFFER, CODEBREAKER_HOOK),
				'FOCUS Buffer→useCodebreaker* on painted paths',
			).toBe(true);

			const hookToDep = bands.some(
				(b) =>
					!b.straight &&
					b.source.startsWith(CODEBREAKER_HOOK) &&
					(b.target.includes('reducer') ||
						b.target.includes('types') ||
						b.target.includes('utils')) &&
					b.focus,
			);
			expect(hookToDep, 'FOCUS hook→deps on painted paths').toBe(true);

			// Forbidden sibling blue track (screenshot)
			expect(
				bandFocused(bands, CODEBREAKER_INDEX, CODEBREAKER_HOOK),
				'sibling index→useCodebreaker must NOT be focus on painted paths',
			).toBe(false);
			expect(
				bandDimmed(bands, CODEBREAKER_INDEX, CODEBREAKER_HOOK),
				'sibling index→useCodebreaker must be dim on painted paths',
			).toBe(true);

			// Labels: Buffer + path + hook on; not all co-importers
			const focusedLabels = labels.filter((l) => l.focus).map((l) => l.name);
			expect(focusedLabels.some((n) => n.includes('Buffer'))).toBe(true);
			expect(focusedLabels.some((n) => n.startsWith(CODEBREAKER_HOOK) || n.includes('useCodebreaker'))).toBe(
				true,
			);
			expect(focusedLabels.some((n) => n.includes('FAQ'))).toBe(false);

			// page spine label on path
			expect(
				focusedLabels.some((n) => n === CODEBREAKER_PAGE || n.includes('page.tsx')),
			).toBe(true);
		} finally {
			await context.close();
		}
	}, 120_000);
});
