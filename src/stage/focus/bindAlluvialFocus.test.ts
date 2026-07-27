/**
 * Sticky default FocusSeed lifecycle on AlluvialFocusApi.
 * clearFocus restores default when set; otherwise clears to neutral.
 *
 * Sticky restore asserts plan identity (seed + activeLabels + focusedBandKeys),
 * not only holder dimming — file and package seeds both dim the mini holder.
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
	};
});

// Import after mock so createHubAlluvialFocus uses the wrapped applyFocusPlan.
const { createHubAlluvialFocus } = await import('./bindAlluvialFocus.ts');
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

/** Minimal classList + empty querySelectorAll for apply/clear without Carbon DOM. */
function miniHolder(): {
	classList: {
		add: (...t: string[]) => void;
		remove: (...t: string[]) => void;
		contains: (t: string) => boolean;
	};
	querySelectorAll: (sel: string) => unknown[];
	_classes: Set<string>;
} {
	const classes = new Set<string>();
	return {
		_classes: classes,
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
	};
}

const drill = {
	drillTargetFromNode: () => null,
	drillTargetFromLine: () => null,
	handleLineClick: () => {},
};

function lastAppliedPlan(): FocusPlan {
	expect(appliedPlans.length).toBeGreaterThan(0);
	return appliedPlans[appliedPlans.length - 1]!;
}

/** Plan equality for sticky restore: seed kind/name + active + bands. */
function expectPlanMatchesPackage(actual: FocusPlan, expected: FocusPlan): void {
	expect(actual.seed).toEqual(expected.seed);
	expect([...actual.activeLabels].sort()).toEqual(
		[...expected.activeLabels].sort(),
	);
	expect([...actual.focusedBandKeys].sort()).toEqual(
		[...expected.focusedBandKeys].sort(),
	);
}

beforeAll(() => {
	// applySeed schedules a rAF re-paint; Node has no browser rAF.
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

describe('AlluvialFocusApi default seed', () => {
	const { graph } = indexFiles(
		walkFixtures(path.join(fixturesRoot, 'demo-react-simple')),
	);
	const payload = projectFileHub(graph, 'src/main.tsx', {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	})!;

	it('clearFocus without default → neutral (no dimming)', () => {
		const holder = miniHolder();
		const api = createHubAlluvialFocus(
			holder as unknown as HTMLElement,
			payload,
			drill,
		);
		api.applySeed({ kind: 'package', name: 'react' }, null);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);

		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(false);
	});

	it('setDefaultSeed + clearFocus restores package seed (not last hover / not neutral)', () => {
		const holder = miniHolder();
		const api = createHubAlluvialFocus(
			holder as unknown as HTMLElement,
			payload,
			drill,
		);
		const pkg = { kind: 'package' as const, name: 'react' };
		const expectedPkg = planFocus(api.graph, pkg);
		const fileSeed = { kind: 'file' as const, name: 'src/main.tsx' };
		const expectedFile = planFocus(api.graph, fileSeed);

		// Precondition: package and file plans must differ (else restore is unobservable).
		expect([...expectedPkg.activeLabels].sort()).not.toEqual(
			[...expectedFile.activeLabels].sort(),
		);
		expect([...expectedPkg.focusedBandKeys].sort()).not.toEqual(
			[...expectedFile.focusedBandKeys].sort(),
		);

		api.setDefaultSeed(pkg);
		api.applySeed(pkg, null);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
		expectPlanMatchesPackage(lastAppliedPlan(), expectedPkg);

		// Hover override (file seed) — last applied must be the file plan
		appliedPlans.length = 0;
		api.applySeed(fileSeed, null);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
		const afterHover = lastAppliedPlan();
		expect(afterHover.seed).toEqual(fileSeed);
		expect([...afterHover.activeLabels].sort()).toEqual(
			[...expectedFile.activeLabels].sort(),
		);

		// mouseleave → clearFocus re-applies sticky package, not reapply(file) or neutral
		appliedPlans.length = 0;
		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
		expect(appliedPlans.length).toBeGreaterThan(0);
		expectPlanMatchesPackage(lastAppliedPlan(), expectedPkg);
		// Explicitly not the file plan that was active before leave
		expect(lastAppliedPlan().seed).not.toEqual(fileSeed);
	});

	it('setDefaultSeed(null) after sticky → clearFocus is neutral', () => {
		const holder = miniHolder();
		const api = createHubAlluvialFocus(
			holder as unknown as HTMLElement,
			payload,
			drill,
		);
		const pkg = { kind: 'package' as const, name: 'react' };
		api.setDefaultSeed(pkg);
		api.applySeed(pkg, null);
		api.setDefaultSeed(null);
		appliedPlans.length = 0;
		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(false);
		// Neutral clear must not re-apply a package plan
		expect(appliedPlans.length).toBe(0);
	});

	it('new API starts with null default (host must re-set after remount)', () => {
		const holder = miniHolder();
		const api = createHubAlluvialFocus(
			holder as unknown as HTMLElement,
			payload,
			drill,
		);
		api.applySeed({ kind: 'package', name: 'react' }, null);
		appliedPlans.length = 0;
		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(false);
		expect(appliedPlans.length).toBe(0);
	});
});
