/**
 * Real codebreaker-shaped hub (fixture from .grok/codebreaker.zip).
 * Locks Buffer / Timer / useCodebreaker hover vs induced cross-cuts and reverse fan-in.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import {
	buildLogicalFocusGraph,
	fileBandKey,
	planFocus,
} from './logicalFocusGraph.ts';

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

describe('codebreaker hub focus (integration)', () => {
	const files = loadFixtureDir(root);
	const graph = buildGraph(files);
	const payload = projectFileHub(graph, PAGE, {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	});
	const g = buildLogicalFocusGraph(payload!);

	it('fixture builds page hub with multi-instance hook', () => {
		expect(payload).toBeTruthy();
		expect(g.fileSpineName).toBe(PAGE);
		expect(g.fileNodes.has(BUFFER)).toBe(true);
		expect(g.fileNodes.has(HOOK) || [...g.fileNodes].some((n) => n.startsWith(HOOK))).toBe(
			true,
		);
		// co-importers reach hook (possibly · hN)
		const hookish = [...g.fileNodes].filter((n) => n.startsWith(HOOK));
		expect(hookish.length).toBeGreaterThanOrEqual(1);
	});

	it('L-file-buffer-real: Buffer hover — path + Buffer→hook only; no index→hook cascade', () => {
		const plan = planFocus(g, { kind: 'file', name: BUFFER });
		const hookAlias = [...plan.activeLabels].find((n) => n.startsWith(HOOK));
		expect(hookAlias, 'hook (or ·hN) label active as Buffer forward dep').toBeTruthy();

		// path ancestors
		expect(plan.activeLabels.has(PAGE)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(BUFFER)).toBe(true);

		// co-importers / FAQ stay dim (labels)
		for (const sib of [TIMER, FAQ, GAME, SEQ, STATUS]) {
			expect(plan.activeLabels.has(sib), `sibling label ${sib}`).toBe(false);
		}

		// path bands
		expect(plan.focusedBandKeys.has(fileBandKey(PAGE, INDEX))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, BUFFER))).toBe(true);

		// Buffer → hook instance
		const bufferToHook = [...plan.focusedBandKeys].some((k) => {
			const [s, t] = k.split('\0');
			return s === BUFFER && t.startsWith(HOOK);
		});
		expect(bufferToHook, 'Buffer→hook band focused').toBe(true);

		// THE screenshot failure: index→useCodebreaker (primary or any) must stay dim
		const indexToHook = [...plan.focusedBandKeys].some((k) => {
			const [s, t] = k.split('\0');
			return s === INDEX && t.startsWith(HOOK);
		});
		expect(indexToHook, 'index→hook cross-cut must be dim').toBe(false);

		// sibling outflows from index dim
		for (const sib of [TIMER, FAQ, GAME, SEQ, STATUS]) {
			expect(plan.focusedBandKeys.has(fileBandKey(INDEX, sib))).toBe(false);
		}

		// primary hook's deeper deps are NOT forced on via alias alone
		// (no re-BFS through alias) — reducer/types may be absent
		// But if present as labels, still no index→hook
	});

	it('L-file-hook-real: useCodebreaker hover dims co-importers', () => {
		const plan = planFocus(g, { kind: 'file', name: HOOK });
		expect(plan.activeLabels.has(PAGE)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(HOOK)).toBe(true);
		for (const sib of [BUFFER, TIMER, FAQ, GAME, SEQ, STATUS]) {
			expect(plan.activeLabels.has(sib), `co-importer ${sib}`).toBe(false);
		}
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, HOOK))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, BUFFER))).toBe(false);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, TIMER))).toBe(false);
		// forward deps of primary hook
		expect(plan.activeLabels.has(REDUCER) || plan.activeLabels.has(TYPES) || plan.activeLabels.has(UTILS)).toBe(
			true,
		);
	});

	it('L-file-timer-real: Timer hover does not focus index→hook', () => {
		const plan = planFocus(g, { kind: 'file', name: TIMER });
		expect(plan.activeLabels.has(TIMER)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		const indexToHook = [...plan.focusedBandKeys].some((k) => {
			const [s, t] = k.split('\0');
			return s === INDEX && t.startsWith(HOOK);
		});
		expect(indexToHook).toBe(false);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, TIMER))).toBe(true);
		expect(plan.activeLabels.has(BUFFER)).toBe(false);
		expect(plan.activeLabels.has(FAQ)).toBe(false);
	});
});
