/**
 * Phase 3: Carbon event adapter — dispatch real CustomEvent detail shapes
 * through bindHubAlluvialFocusEvents (not applySeed alone).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import type { FocusPlan } from './logicalFocusGraph.ts';
import { planFocus } from './logicalFocusGraph.ts';

const appliedPlans: FocusPlan[] = [];

vi.mock('./focusApply.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./focusApply.ts')>();
	return {
		...actual,
		applyFocusPlan: (
			holder: Parameters<typeof actual.applyFocusPlan>[0],
			plan: FocusPlan,
			opts?: Parameters<typeof actual.applyFocusPlan>[2],
		) => {
			appliedPlans.push(plan);
			return actual.applyFocusPlan(holder, plan, opts);
		},
		clearFocusPlan: (
			holder: Parameters<typeof actual.clearFocusPlan>[0],
		) => {
			appliedPlans.push({
				seed: { kind: 'file', name: '__cleared__' },
				activeLabels: new Set(),
				focusedBandKeys: new Set(),
				drillTarget: null,
			});
			return actual.clearFocusPlan(holder);
		},
	};
});

const { createHubAlluvialFocus, bindHubAlluvialFocusEvents } = await import(
	'./bindAlluvialFocus.ts'
);
const { CLASS_DIMMING } = await import('./focusApply.ts');

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function walkFixtures(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walkFixtures(full, base));
		else {
			const rel = path.relative(base, full).split(path.sep).join('/');
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel,
				content,
				byteLength: Buffer.byteLength(content),
			});
		}
	}
	return out;
}

function miniHolder(): HTMLElement {
	const classes = new Set<string>();
	return {
		classList: {
			add: (...t: string[]) => {
				for (const x of t) if (x) classes.add(x);
			},
			remove: (...t: string[]) => {
				for (const x of t) classes.delete(x);
			},
			contains: (t: string) => classes.has(t),
		},
		querySelectorAll: () => [],
	} as unknown as HTMLElement;
}

/** Minimal Carbon events bus (EventTarget). */
function makeEventsBus(): EventTarget & {
	dispatch: (type: string, detail: unknown) => void;
} {
	const target = new EventTarget();
	return Object.assign(target, {
		dispatch(type: string, detail: unknown) {
			target.dispatchEvent(
				new CustomEvent(type, { detail: { datum: detail } }),
			);
		},
	});
}

const drill = {
	drillTargetFromNode: () => null,
	drillTargetFromLine: () => null,
	handleLineClick: () => {},
};

beforeAll(() => {
	if (typeof globalThis.requestAnimationFrame !== 'function') {
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			cb(0);
			return 0;
		}) as typeof requestAnimationFrame;
	}
});

beforeEach(() => {
	appliedPlans.length = 0;
});

describe('bindHubAlluvialFocusEvents (Carbon CustomEvent shapes)', () => {
	const { graph } = indexFiles(
		walkFixtures(path.join(fixturesRoot, 'demo-react-simple')),
	);
	const payload = projectFileHub(graph, 'src/main.tsx', {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	})!;

	function setup() {
		const holder = miniHolder();
		const focusApi = createHubAlluvialFocus(holder, payload, drill);
		const bus = makeEventsBus();
		bindHubAlluvialFocusEvents(
			{ services: { events: bus } },
			focusApi,
			drill,
		);
		return { holder, focusApi, bus };
	}

	it('alluvial-node-mouseover applies file FocusPlan', () => {
		const { focusApi, bus } = setup();
		const fileName = 'src/App.tsx';
		const exp = planFocus(focusApi.graph, { kind: 'file', name: fileName });
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-mouseover', { name: fileName });
		expect(appliedPlans.length).toBeGreaterThan(0);
		const last = appliedPlans[appliedPlans.length - 1]!;
		expect(last.seed).toEqual({ kind: 'file', name: fileName });
		expect(last.focusedBandKeys.size).toBeGreaterThan(0);
		expect([...last.focusedBandKeys].sort()).toEqual(
			[...exp.focusedBandKeys].sort(),
		);
	});

	it('alluvial-line-mouseover applies band FocusPlan', () => {
		const { focusApi, bus } = setup();
		// Pick a real file→file edge from the logical graph
		const edge = focusApi.graph.fileEdges[0];
		expect(edge, 'fixture has file edges').toBeTruthy();
		const source = edge!.source;
		const target = edge!.target;
		appliedPlans.length = 0;
		bus.dispatch('alluvial-line-mouseover', {
			source: { name: source },
			target: { name: target },
		});
		expect(appliedPlans.length).toBeGreaterThan(0);
		const last = appliedPlans[appliedPlans.length - 1]!;
		expect(last.seed).toMatchObject({
			kind: 'band',
			source,
			target,
			display: 'carbon',
		});
	});

	it('alluvial-node-mouseover on package applies package plan', () => {
		const { focusApi, bus } = setup();
		const pkg = [...focusApi.graph.packageNodes][0];
		expect(pkg, 'fixture has package nodes').toBeTruthy();
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-mouseover', { name: pkg });
		const last = appliedPlans[appliedPlans.length - 1]!;
		expect(last.seed).toEqual({ kind: 'package', name: pkg });
		expect(last.focusedBandKeys.size).toBeGreaterThan(0);
	});

	it('rail node mouseover does not apply a plan', () => {
		const { bus } = setup();
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-mouseover', {
			name: '\u200b·in-rail·h1',
		});
		expect(appliedPlans.length).toBe(0);
	});

	it('alluvial-node-mouseout clears to sticky package default', () => {
		const { focusApi, bus, holder } = setup();
		const pkg = [...focusApi.graph.packageNodes][0]!;
		const pkgSeed = { kind: 'package' as const, name: pkg };
		const expected = planFocus(focusApi.graph, pkgSeed);
		focusApi.setDefaultSeed(pkgSeed);
		focusApi.applySeed(pkgSeed, null);

		// Hover a file
		const fileName = 'src/App.tsx';
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-mouseover', { name: fileName });
		expect(appliedPlans[appliedPlans.length - 1]!.seed).toMatchObject({
			kind: 'file',
			name: fileName,
		});

		// mouseout → sticky restore
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-mouseout', {});
		expect(appliedPlans.length).toBeGreaterThan(0);
		const last = appliedPlans[appliedPlans.length - 1]!;
		expect(last.seed).toEqual(pkgSeed);
		expect([...last.focusedBandKeys].sort()).toEqual(
			[...expected.focusedBandKeys].sort(),
		);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
	});

	it('wrong event name does not apply focus (broken adapter fail-closed)', () => {
		const { bus } = setup();
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-hover', { name: 'src/App.tsx' }); // wrong name
		bus.dispatch('node-mouseover', { name: 'src/App.tsx' });
		expect(appliedPlans.length).toBe(0);
	});

	it('malformed datum shape does not apply focus', () => {
		const { bus } = setup();
		appliedPlans.length = 0;
		bus.dispatch('alluvial-node-mouseover', null);
		bus.dispatch('alluvial-node-mouseover', { notName: true });
		bus.dispatch('alluvial-line-mouseover', { source: 1, target: 2 });
		bus.dispatch('alluvial-line-mouseover', {});
		expect(appliedPlans.length).toBe(0);
	});

	it('missing events service is a no-op (no throw)', () => {
		const focusApi = createHubAlluvialFocus(miniHolder(), payload, drill);
		expect(() =>
			bindHubAlluvialFocusEvents({}, focusApi, drill),
		).not.toThrow();
		expect(() =>
			bindHubAlluvialFocusEvents(
				{ services: {} },
				focusApi,
				drill,
			),
		).not.toThrow();
	});
});
