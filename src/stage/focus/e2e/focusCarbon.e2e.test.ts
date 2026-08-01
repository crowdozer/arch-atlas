/**
 * Browser e2e (Artillery pattern): real Carbon Alluvial + polish + focus apply.
 * Not in default `npm test` - run `npm run test:e2e:focus`.
 *
 * Phase 3: **physical pointer** hover (not sole applySeed). Stale dist fails
 * closed via source-hash rebuild. Node engines enforced in e2eServer.
 *
 * Pins painted path classes: Buffer hover → Buffer→hook focus; sibling dim.
 */
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildCodebreakerPageHubPayload,
	CODEBREAKER_BUFFER,
	CODEBREAKER_HOOK,
	CODEBREAKER_INDEX,
} from './buildCodebreakerPayload.ts';
import {
	bandFocused,
	dumpBandsInBrowser,
	dumpLabelsInBrowser,
	hoverBandPhysical,
	hoverFileApplySeed,
	hoverFilePhysical,
	leaveChartPhysical,
	loadHubPayload,
	waitForFocusE2EReady,
} from './e2eHelpers.ts';
import {
	assertNodeEngines,
	startAstroDevServer,
	type AstroDevServer,
} from './e2eServer.ts';

describe('focus Carbon e2e (codebreaker Buffer sibling track)', () => {
	let server: AstroDevServer;
	let browser: Browser;
	let baseUrl: string;
	// Built once in Node; stripped of functions before browser inject.
	const payload = buildCodebreakerPageHubPayload();

	beforeAll(async () => {
		assertNodeEngines('22.12.0');
		// Isolated preview - never attaches to user's :4321 main checkout.
		server = await startAstroDevServer();
		baseUrl = server.baseUrl;
		browser = await chromium.launch();
	}, 300_000);

	afterAll(async () => {
		await browser?.close();
		await server?.stop();
	});

	it('physical Buffer hover: Buffer→hook focus; sibling index→hook dim on real SVG', async () => {
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

			// Sanity: Carbon drew paths + node groups
			const before = await dumpBandsInBrowser(page);
			expect(before.length, 'Carbon drew path.link bands').toBeGreaterThan(5);
			const nodeCount = await page.locator('g.node-group').count();
			expect(nodeCount, 'Carbon drew node groups').toBeGreaterThan(2);

			// Phase 3: physical pointer (DOM binding), not applySeed alone
			await hoverFilePhysical(page, CODEBREAKER_BUFFER);
			let bands = await dumpBandsInBrowser(page);
			let labels = await dumpLabelsInBrowser(page);

			// If physical Carbon events are flaky on this chart build, fall back
			// once with applySeed and fail with a clear message if still wrong -
			// physical path is preferred; soft fallback only for CI environment.
			if (!bandFocused(bands, CODEBREAKER_BUFFER, CODEBREAKER_HOOK)) {
				// Retry physical once after settle
				await page.waitForTimeout(200);
				await hoverFilePhysical(page, CODEBREAKER_BUFFER);
				bands = await dumpBandsInBrowser(page);
			}

			// Still require focus - if physical path never fires Carbon events,
			// this fails (correct fail-closed for broken DOM binding).
			// Document: applySeed helper remains for lower-level diagnostics only.
			const physicalOk = bandFocused(
				bands,
				CODEBREAKER_BUFFER,
				CODEBREAKER_HOOK,
			);
			if (!physicalOk) {
				// Diagnostic: prove payload + plan path still works (so failure is binding)
				await hoverFileApplySeed(page, CODEBREAKER_BUFFER);
				const afterSeed = await dumpBandsInBrowser(page);
				const seedOk = bandFocused(
					afterSeed,
					CODEBREAKER_BUFFER,
					CODEBREAKER_HOOK,
				);
				throw new Error(
					`Physical pointer hover did not focus Buffer→hook ` +
						`(applySeed still ${seedOk ? 'works' : 'also fails'}). ` +
						`DOM binding / Carbon event path is broken.`,
				);
			}

			// L-instance-local: primary Imports hook and its dep cascade stay off
			expect(
				bandFocused(bands, CODEBREAKER_INDEX, CODEBREAKER_HOOK),
				'primary index→useCodebreaker must NOT focus',
			).toBe(false);
			const primaryDepFocus = bands.some(
				(b) =>
					!b.straight &&
					b.source === CODEBREAKER_HOOK &&
					!/#\d+$/u.test(b.source) &&
					(b.target.includes('reducer') ||
						b.target.includes('types') ||
						b.target.includes('utils')) &&
					b.focus,
			);
			expect(primaryDepFocus, 'primary hook→deps must stay dim').toBe(false);

			labels = await dumpLabelsInBrowser(page);
			const focusedLabels = labels.filter((l) => l.focus).map((l) => l.name);
			expect(focusedLabels.some((n) => n.includes('Buffer'))).toBe(true);
			// hop instance yes; exact primary label no
			expect(
				focusedLabels.some(
					(n) => n.startsWith(CODEBREAKER_HOOK) && /#\d+$/u.test(n),
				),
			).toBe(true);
			expect(focusedLabels.includes(CODEBREAKER_HOOK)).toBe(false);
			expect(focusedLabels.some((n) => n.includes('FAQ'))).toBe(false);

			// mouseleave chart → clear focus classes (no sticky seed on e2e boot)
			await leaveChartPhysical(page);
			const afterLeave = await dumpBandsInBrowser(page);
			const stillFocused = afterLeave.some((b) => b.focus);
			// clear may be sticky-neutral; at least chart should not keep Buffer plan only
			// When no defaultSeed, clearFocus clears dimming - focus classes should drop
			expect(
				stillFocused,
				'after mouseleave, no band should remain focused without sticky seed',
			).toBe(false);
		} finally {
			await context.close();
		}
	}, 180_000);

	it('physical band hover focuses a carbon ribbon when hit-test succeeds', async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(`${baseUrl}/focus-e2e/`, {
				waitUntil: 'networkidle',
				timeout: 60_000,
			});
			await waitForFocusE2EReady(page);
			await loadHubPayload(page, payload);
			const before = await dumpBandsInBrowser(page);
			const candidate = before.find(
				(b) =>
					!b.straight &&
					b.source.includes('Buffer') &&
					b.target.includes('useCodebreaker'),
			);
			expect(candidate, 'Buffer→hook band exists').toBeTruthy();
			const targetPrefix = candidate!.target.replace(/#\d+$/u, '');
			await hoverBandPhysical(page, candidate!.source, targetPrefix);
			let bands = await dumpBandsInBrowser(page);
			let focused = bands.filter((b) => b.focus);
			// Thin Sankey ribbons can miss the cursor; retry mid-point via applySeed
			// only as diagnostic - require either physical focus or explicit fail.
			if (focused.length === 0) {
				await hoverBandPhysical(page, candidate!.source, targetPrefix);
				await page.waitForTimeout(200);
				bands = await dumpBandsInBrowser(page);
				focused = bands.filter((b) => b.focus);
			}
			// Thin ribbons are hard to hit; require either target band focus or any
			// focus paint (proves path.mouseenter binding). Node physical is the
			// hard gate in the previous test.
			expect(
				focused.length,
				'physical path hover should apply some band focus plan',
			).toBeGreaterThanOrEqual(1);
		} finally {
			await context.close();
		}
	}, 120_000);
});
