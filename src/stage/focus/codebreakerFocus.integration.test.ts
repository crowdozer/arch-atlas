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
		// co-importers reach hook (possibly #N)
		const hookish = [...g.fileNodes].filter((n) => n.startsWith(HOOK));
		expect(hookish.length).toBeGreaterThanOrEqual(1);
	});

	it('L-instance-local: Buffer→#N on; primary Imports hook off', () => {
		const plan = planFocus(g, { kind: 'file', name: BUFFER });

		expect(plan.activeLabels.has(PAGE)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(BUFFER)).toBe(true);

		// hop instance of hook, not primary
		expect(
			[...plan.activeLabels].some(
				(n) => n.startsWith(HOOK) && /#\d+$/u.test(n),
			),
		).toBe(true);
		expect(plan.activeLabels.has(HOOK)).toBe(false);
		// deps hang off primary instance — not activated via #N id alias
		expect(plan.activeLabels.has(REDUCER)).toBe(false);

		for (const sib of [TIMER, FAQ, GAME, SEQ, STATUS]) {
			expect(plan.activeLabels.has(sib), `sibling label ${sib}`).toBe(false);
		}

		expect(plan.focusedBandKeys.has(fileBandKey(PAGE, INDEX))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, BUFFER))).toBe(true);
		const bufferToHop = [...plan.focusedBandKeys].some((k) => {
			const [s, t] = k.split('\0');
			return s === BUFFER && !!t && t.startsWith(HOOK) && /#\d+$/u.test(t);
		});
		expect(bufferToHop, 'Buffer→useCodebreaker #N focused').toBe(true);

		// primary Imports track off
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, HOOK))).toBe(false);
	});

	it('L-instance-local: primary useCodebreaker does not light hop consumers', () => {
		const plan = planFocus(g, { kind: 'file', name: HOOK });
		expect(plan.activeLabels.has(HOOK)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		// hop consumers import #N, not primary — stay dim under instance-local
		for (const sib of [BUFFER, TIMER, FAQ, GAME, SEQ, STATUS]) {
			expect(plan.activeLabels.has(sib), `hop consumer ${sib}`).toBe(false);
		}
		expect(
			[...plan.activeLabels].some(
				(n) => n.startsWith(HOOK) && /#\d+$/u.test(n),
			),
		).toBe(false);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, HOOK))).toBe(true);
		// forward deps of primary
		expect(
			plan.activeLabels.has(REDUCER) ||
				plan.activeLabels.has(TYPES) ||
				plan.activeLabels.has(UTILS),
		).toBe(true);
	});
});
