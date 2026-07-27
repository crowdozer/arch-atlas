/**
 * Sticky default FocusSeed lifecycle on AlluvialFocusApi.
 * clearFocus restores default when set; otherwise clears to neutral.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import { createHubAlluvialFocus } from './bindAlluvialFocus.ts';
import { CLASS_DIMMING } from './focusApply.ts';

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

beforeAll(() => {
	// applySeed schedules a rAF re-paint; Node has no browser rAF.
	if (typeof globalThis.requestAnimationFrame !== 'function') {
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			cb(0);
			return 0;
		}) as typeof requestAnimationFrame;
	}
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

	it('setDefaultSeed + clearFocus restores package seed (dimming stays)', () => {
		const holder = miniHolder();
		const api = createHubAlluvialFocus(
			holder as unknown as HTMLElement,
			payload,
			drill,
		);
		const pkg = { kind: 'package' as const, name: 'react' };
		api.setDefaultSeed(pkg);
		api.applySeed(pkg, null);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);

		// Hover override (file seed)
		api.applySeed({ kind: 'file', name: 'src/main.tsx' }, null);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);

		// mouseleave → clearFocus restores sticky package, not neutral
		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
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
		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(false);
	});

	it('new API starts with null default (host must re-set after remount)', () => {
		const holder = miniHolder();
		const api = createHubAlluvialFocus(
			holder as unknown as HTMLElement,
			payload,
			drill,
		);
		api.applySeed({ kind: 'package', name: 'react' }, null);
		api.clearFocus();
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(false);
	});
});
