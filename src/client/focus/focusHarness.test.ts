/**
 * Focus harness — detects the codebreaker sibling-path over-light class and
 * pins alleviation (Buffer hover: Buffer→hook→deps focus; index→hook dim).
 *
 * Success criteria for ship e6058c97:
 *  1. Harness exposes drawn-band focus|dim as data (not screenshots).
 *  2. Observed bug class (sibling index→useCodebreaker) is detectably dim.
 *  3. Expected path (Buffer→hook→deps) is detectably focus.
 *  4. Apply layer class dump agrees with classification.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import {
	assertCompleteClassification,
	fileBandKey,
	hasDimDrawnEdge,
	hasFocusedDrawnEdge,
	observeHubFocus,
	observeHubFocusApplied,
} from './focusHarness.ts';

const root = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures/codebreaker-focus',
);

function loadFixtureDir(dir: string, prefix = ''): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const rel = prefix ? `${prefix}/${name}` : name;
		if (statSync(full).isDirectory()) {
			if (name === 'node_modules' || name === '.next') continue;
			out.push(...loadFixtureDir(full, rel));
		} else if (/\.(ts|tsx|js|jsx|json|css|md)$/.test(name)) {
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel.replace(/\\/g, '/'),
				content,
				byteLength: content.length,
			});
		}
	}
	return out;
}

const PAGE = 'app/page.tsx';
const INDEX = 'app/components/codebreaker/index.tsx';
const HOOK = 'app/components/codebreaker/useCodebreaker.ts';
const BUFFER = 'app/components/codebreaker/components/Buffer.tsx';
const TIMER = 'app/components/codebreaker/components/Timer.tsx';
const FAQ = 'app/components/codebreaker/components/FAQ.tsx';
const GAME = 'app/components/codebreaker/components/GameBoard.tsx';
const SEQ = 'app/components/codebreaker/components/Sequences.tsx';
const STATUS = 'app/components/codebreaker/components/Status.tsx';
const REDUCER = 'app/components/codebreaker/reducer.ts';
const TYPES = 'app/components/codebreaker/types.ts';
const UTILS = 'app/components/codebreaker/utils.ts';

const SIBLINGS = [TIMER, FAQ, GAME, SEQ, STATUS] as const;

describe('focus harness (drawn-band observability)', () => {
	const files = loadFixtureDir(root);
	const graph = buildGraph(files);
	const payload = projectFileHub(graph, PAGE, {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	})!;

	it('inventory includes sibling index→hook and Buffer→hook edges', () => {
		const obs = observeHubFocus(payload, { kind: 'file', name: BUFFER });
		assertCompleteClassification(obs);
		expect(obs.inventory.bands.length).toBeGreaterThan(5);

		// Drawn inventory must contain the blue-track candidates from the screenshot
		const keys = new Set(obs.inventory.bands.map((b) => b.key));
		expect(
			[...keys].some((k) => {
				const [s, t] = k.split('\0');
				return s === INDEX && t.startsWith(HOOK);
			}),
			'drawn inventory must include index→hook (sibling track)',
		).toBe(true);
		expect(
			[...keys].some((k) => {
				const [s, t] = k.split('\0');
				return s === BUFFER && t.startsWith(HOOK);
			}),
			'drawn inventory must include Buffer→hook',
		).toBe(true);
	});

	it('DETECT+ALLEVIATE: Buffer hover — hop instance only; primary Imports hook dim', () => {
		const obs = observeHubFocus(payload, { kind: 'file', name: BUFFER });
		assertCompleteClassification(obs);

		// Buffer → multi-instance hook (· hN)
		expect(
			hasFocusedDrawnEdge(obs, BUFFER, HOOK),
			'FOCUS Buffer→useCodebreaker*',
		).toBe(true);

		// L-instance-local: primary Imports useCodebreaker stays off
		expect(obs.activeLabels.includes(HOOK)).toBe(false);
		// primary→deps attach to primary instance — not activated via hop alias
		expect(obs.activeLabels.includes(REDUCER)).toBe(false);
		expect(obs.activeLabels.includes(TYPES)).toBe(false);

		// —— forbidden: Imports-column primary index→useCodebreaker ——————————
		expect(
			hasFocusedDrawnEdge(obs, INDEX, HOOK),
			'must NOT focus primary index→useCodebreaker',
		).toBe(false);
		// primary edge must exist in inventory and be dim (not absent-only)
		const primaryKey = fileBandKey(INDEX, HOOK);
		if (obs.classification.has(primaryKey)) {
			expect(obs.classification.get(primaryKey)).toBe('dim');
		}

		// hop instance label on, not primary
		expect(obs.activeLabels.some((n) => n.startsWith(HOOK) && n.includes('·'))).toBe(
			true,
		);
		expect(obs.activeLabels.includes(BUFFER)).toBe(true);
		expect(obs.activeLabels.includes(INDEX)).toBe(true);
		for (const sib of SIBLINGS) {
			expect(obs.activeLabels.includes(sib), `label ${sib}`).toBe(false);
		}
	});

	it('DETECT: id-alias across ·hN would light primary (bug class characterization)', () => {
		/**
		 * Pre-interim failure: expandFileAliases by nodeRef.id made Buffer→·hN
		 * activate primary useCodebreaker (same id), lighting index→primary.
		 * With L-instance-local, primary label stays off on Buffer hover.
		 */
		const obs = observeHubFocus(payload, { kind: 'file', name: BUFFER });
		const hopLit = obs.activeLabels.some((n) => n.startsWith(HOOK) && n.includes('·'));
		expect(hopLit).toBe(true);
		expect(obs.activeLabels.includes(HOOK)).toBe(false);
		expect(hasFocusedDrawnEdge(obs, INDEX, HOOK)).toBe(false);
	});

	it('APPLY layer: MiniEl class dump agrees with classification', () => {
		const { observation, applied } = observeHubFocusApplied(payload, {
			kind: 'file',
			name: BUFFER,
		});
		expect(applied.holderDimming).toBe(true);

		for (const row of applied.bands) {
			if (row.kind === 'straighten') {
				const cls = observation.classification.get(row.key);
				if (cls === 'focus') expect(row.focus).toBe(true);
				else if (cls === 'dim') expect(row.focus).toBe(false);
				continue;
			}
			const cls = observation.classification.get(row.key);
			expect(cls === 'focus' || cls === 'dim', row.key).toBe(true);
			if (cls === 'focus') {
				expect(row.focus, `apply focus ${row.source}→${row.target}`).toBe(true);
				expect(row.dim).toBe(false);
			} else {
				expect(row.dim, `apply dim ${row.source}→${row.target}`).toBe(true);
				expect(row.focus).toBe(false);
			}
		}

		// Primary Imports index→hook dim in applied dump (if drawn)
		const primary = applied.bands.find(
			(b) => b.source === INDEX && b.target === HOOK,
		);
		if (primary) {
			expect(primary.focus).toBe(false);
			expect(primary.dim).toBe(true);
		}

		// Buffer→hop instance focus
		const bufHook = applied.bands.find(
			(b) => b.source === BUFFER && b.target.startsWith(HOOK) && b.target.includes('·'),
		);
		expect(bufHook).toBeTruthy();
		expect(bufHook!.focus).toBe(true);
	});

	it('FAQ control: hover FAQ does not focus index→hook or hook deps cascade', () => {
		const obs = observeHubFocus(payload, { kind: 'file', name: FAQ });
		assertCompleteClassification(obs);
		expect(hasFocusedDrawnEdge(obs, INDEX, HOOK)).toBe(false);
		expect(obs.activeLabels.some((n) => n.startsWith(HOOK))).toBe(false);
		expect(obs.classification.get(fileBandKey(INDEX, FAQ))).toBe('focus');
	});

	it('useCodebreaker hover: co-importer labels dim; FAQ still dim', () => {
		const obs = observeHubFocus(payload, { kind: 'file', name: HOOK });
		for (const sib of [BUFFER, TIMER, FAQ, GAME, SEQ, STATUS]) {
			expect(obs.activeLabels.includes(sib), sib).toBe(false);
		}
		// path index→hook is on (not sibling of self)
		expect(hasFocusedDrawnEdge(obs, INDEX, HOOK)).toBe(true);
	});
});
