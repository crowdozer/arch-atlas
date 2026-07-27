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

	it('DETECT+ALLEVIATE: Buffer hover — sibling index→hook dim; Buffer→hook→deps focus', () => {
		const obs = observeHubFocus(payload, { kind: 'file', name: BUFFER });
		assertCompleteClassification(obs);

		// —— expected path (Buffer → hook → deps) ————————————————————————
		expect(
			hasFocusedDrawnEdge(obs, BUFFER, HOOK),
			'FOCUS Buffer→useCodebreaker*',
		).toBe(true);

		const hookToDepFocus = obs.focusedDrawn.some(
			(b) =>
				b.kind === 'carbon' &&
				b.source.startsWith(HOOK) &&
				(b.target === REDUCER ||
					b.target === TYPES ||
					b.target === UTILS ||
					b.target.startsWith(REDUCER) ||
					b.target.startsWith(TYPES) ||
					b.target.startsWith(UTILS)),
		);
		expect(
			hookToDepFocus,
			'FOCUS useCodebreaker→reducer|types|utils (Buffer forward tree)',
		).toBe(true);

		// —— forbidden sibling track (screenshot blue cascade) ——————————
		expect(
			hasFocusedDrawnEdge(obs, INDEX, HOOK),
			'must NOT focus sibling index→useCodebreaker*',
		).toBe(false);
		expect(
			hasDimDrawnEdge(obs, INDEX, HOOK),
			'sibling index→useCodebreaker* must be explicitly dim on inventory',
		).toBe(true);

		// other index→sibling outflows dim
		for (const sib of SIBLINGS) {
			const paint = obs.classification.get(fileBandKey(INDEX, sib));
			if (paint === undefined) continue; // not drawn
			expect(paint, `index→${sib}`).toBe('dim');
		}

		// labels: siblings off; path + hook deps on
		expect(obs.activeLabels.includes(BUFFER)).toBe(true);
		expect(obs.activeLabels.includes(INDEX)).toBe(true);
		expect(obs.activeLabels.some((n) => n.startsWith(HOOK))).toBe(true);
		expect(obs.activeLabels.includes(REDUCER)).toBe(true);
		for (const sib of SIBLINGS) {
			expect(obs.activeLabels.includes(sib), `label ${sib}`).toBe(false);
		}
	});

	it('DETECT: full-union induction would light sibling track (bug class characterization)', () => {
		/**
		 * Documents the pre-fix failure mode: if focusedBandKeys were
		 * induced(ancestors∪descendants), index→hook would be focus whenever
		 * both ends are active labels. Harness proves current plan does not.
		 */
		const obs = observeHubFocus(payload, { kind: 'file', name: BUFFER });
		const active = obs.activeLabels; // sorted string[]
		// Both ends of sibling edge are often active (index path ancestor + hook forward)
		const indexActive = active.includes(INDEX);
		const hookActive = active.some((n) => n.startsWith(HOOK));
		expect(indexActive && hookActive).toBe(true);

		// Bug class: both active BUT drawn classification is dim
		expect(hasDimDrawnEdge(obs, INDEX, HOOK)).toBe(true);
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

		// Sibling track dim in applied dump
		const sibling = applied.bands.find(
			(b) => b.source === INDEX && b.target.startsWith(HOOK),
		);
		expect(sibling, 'applied dump includes index→hook path').toBeTruthy();
		expect(sibling!.focus).toBe(false);
		expect(sibling!.dim).toBe(true);

		// Buffer→hook focus in applied dump
		const bufHook = applied.bands.find(
			(b) => b.source === BUFFER && b.target.startsWith(HOOK),
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
