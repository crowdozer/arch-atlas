/**
 * Pure FocusPlan matrix — cites hub-focus-behavior.md case IDs (L-*).
 * Fixtures: projectFileHub on demo-react-simple (main / App hubs).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { isAlluvialRailName } from '@core/view/alluvial.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import {
	buildLogicalFocusGraph,
	buildLogicalFocusGraphFromParts,
	externalBandKey,
	fileBandKey,
	planFocus,
	type FocusPlan,
	type LogicalFocusGraph,
} from './logicalFocusGraph.ts';

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

function assertNoRails(plan: FocusPlan): void {
	for (const n of plan.activeLabels) {
		expect(isAlluvialRailName(n), `rail in activeLabels: ${n}`).toBe(false);
	}
	for (const k of plan.focusedBandKeys) {
		expect(k.includes('in-rail') || k.includes('out-rail'), `rail band ${k}`).toBe(
			false,
		);
	}
}

/** Every focused band key must be a known logical edge on the graph. */
function assertFocusedBandsSubsetOfLogical(
	graph: LogicalFocusGraph,
	plan: FocusPlan,
): void {
	const logical = new Set<string>();
	for (const e of graph.fileEdges) {
		logical.add(fileBandKey(e.source, e.target));
	}
	for (const e of graph.externalEdges) {
		logical.add(externalBandKey(e.source, e.target));
	}
	for (const k of plan.focusedBandKeys) {
		expect(logical.has(k), `focused band not on logical graph: ${k.replace('\0', '→')}`).toBe(
			true,
		);
	}
}

/**
 * Label-hover completeness: every file edge with both ends active, and every
 * external edge whose law includes it, appears in focusedBandKeys.
 * (Checked by re-deriving from plan labels for file/package seeds.)
 */
function assertLabelHoverCompleteness(
	graph: LogicalFocusGraph,
	plan: FocusPlan,
	mode: 'file' | 'package',
	pkg?: string,
): void {
	const active = plan.activeLabels;
	const aliasOn = (name: string): boolean =>
		[...active].some(
			(a) =>
				a === name ||
				(graph.nodeRef[a]?.kind === 'file' &&
					graph.nodeRef[name]?.kind === 'file' &&
					graph.nodeRef[a]?.id === graph.nodeRef[name]?.id),
		);
	for (const e of graph.fileEdges) {
		if (aliasOn(e.source) && aliasOn(e.target)) {
			const key = fileBandKey(e.source, e.target);
			expect(
				plan.focusedBandKeys.has(key),
				`missing file band ${e.source}→${e.target}`,
			).toBe(true);
		}
	}
	if (mode === 'package' && pkg) {
		for (const e of graph.externalEdges) {
			if (e.target !== pkg) continue;
			if (aliasOn(e.source)) {
				expect(
					plan.focusedBandKeys.has(externalBandKey(e.source, e.target)),
					`missing ext band ${e.source}→${e.target}`,
				).toBe(true);
			}
		}
	}
	if (mode === 'file') {
		// External edges whose parent is active (file law uses forward-only
		// parents; plan already encodes that — only assert present keys ⊆ logic)
		for (const k of plan.focusedBandKeys) {
			if (!k.startsWith('ext:')) continue;
			const rest = k.slice(4);
			const i = rest.indexOf('\0');
			const parent = rest.slice(0, i);
			expect(aliasOn(parent), `ext parent not active: ${parent}`).toBe(true);
		}
	}
}

const MAIN = 'src/main.tsx';
const APP = 'src/App.tsx';

describe('LogicalFocusGraph matrix (demo-react-simple)', () => {
	const { graph } = indexFiles(
		walkFixtures(path.join(fixturesRoot, 'demo-react-simple')),
	);
	const mainPayload = projectFileHub(graph, MAIN, {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	})!;
	const appPayload = projectFileHub(graph, APP, {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	})!;
	const mainGraph = buildLogicalFocusGraph(mainPayload);
	const appGraph = buildLogicalFocusGraph(appPayload);

	it('L-band-file: hover carbon main→App — only that band; labels {main,App}', () => {
		const plan = planFocus(mainGraph, {
			kind: 'band',
			source: MAIN,
			target: APP,
			display: 'carbon',
		});
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		expect(plan.focusedBandKeys.size).toBe(1);
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, APP))).toBe(true);
		expect(plan.activeLabels.has(MAIN)).toBe(true);
		expect(plan.activeLabels.has(APP)).toBe(true);
		expect(plan.activeLabels.has('src/lib/logger.ts')).toBe(false);
		expect(plan.activeLabels.has('react')).toBe(false);
		// sibling fork not lit
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, 'src/lib/logger.ts'))).toBe(
			false,
		);
	});

	it('L-band-ext: hover straighten main→react — only that ext key; not react-dom sibling', () => {
		const plan = planFocus(mainGraph, {
			kind: 'band',
			source: MAIN,
			target: 'react',
			display: 'straighten',
		});
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		expect(plan.focusedBandKeys.size).toBe(1);
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react'))).toBe(true);
		expect(
			plan.focusedBandKeys.has(externalBandKey(MAIN, 'react-dom')),
		).toBe(false);
		expect(plan.activeLabels.has(MAIN)).toBe(true);
		expect(plan.activeLabels.has('react')).toBe(true);
		expect(plan.activeLabels.has('react-dom')).toBe(false);
	});

	it('L-file-main: hover main — forward tree + main’s packages; reverse self', () => {
		const plan = planFocus(mainGraph, { kind: 'file', name: MAIN });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		assertLabelHoverCompleteness(mainGraph, plan, 'file');

		expect(plan.activeLabels.has(MAIN)).toBe(true);
		expect(plan.activeLabels.has(APP)).toBe(true);
		expect(plan.activeLabels.has('src/lib/logger.ts')).toBe(true);
		expect(plan.activeLabels.has('src/pages/Home.tsx')).toBe(true);
		expect(plan.activeLabels.has('src/hooks/useUser.ts')).toBe(true);
		// main’s packages
		expect(plan.activeLabels.has('react')).toBe(true);
		expect(plan.activeLabels.has('react-dom')).toBe(true);
		expect(plan.activeLabels.has('react-router-dom')).toBe(true);
		expect(plan.activeLabels.has('zod')).toBe(true);

		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, APP))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, 'src/lib/logger.ts'))).toBe(
			true,
		);
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react'))).toBe(true);
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react-dom'))).toBe(
			true,
		);
	});

	it('L-file-app: hover App — ancestors∪descendants; not logger; not main→react-dom', () => {
		const plan = planFocus(mainGraph, { kind: 'file', name: APP });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		assertLabelHoverCompleteness(mainGraph, plan, 'file');

		// ancestors
		expect(plan.activeLabels.has(MAIN)).toBe(true);
		expect(plan.activeLabels.has(APP)).toBe(true);
		// descendants
		expect(plan.activeLabels.has('src/pages/Home.tsx')).toBe(true);
		expect(plan.activeLabels.has('src/components/Layout.tsx')).toBe(true);
		expect(plan.activeLabels.has('src/hooks/useUser.ts')).toBe(true);
		expect(plan.activeLabels.has('src/types.ts')).toBe(true);
		// sibling of App under main — out
		expect(plan.activeLabels.has('src/lib/logger.ts')).toBe(false);
		// packages of App∪forward only — not main-only react-dom
		expect(plan.activeLabels.has('react')).toBe(true); // via Layout/Home/useUser
		expect(plan.activeLabels.has('react-router-dom')).toBe(true); // App/Layout
		expect(plan.activeLabels.has('zod')).toBe(true);
		expect(plan.activeLabels.has('react-dom')).toBe(false);

		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, APP))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, 'src/lib/logger.ts'))).toBe(
			false,
		);
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react-dom'))).toBe(
			false,
		);
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react'))).toBe(false);
		expect(
			plan.focusedBandKeys.has(
				externalBandKey('src/hooks/useUser.ts', 'react'),
			),
		).toBe(true);
	});

	it('L-pkg-react: reverse-path union from all pair parents; not rails; not logger', () => {
		const plan = planFocus(mainGraph, { kind: 'package', name: 'react' });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		assertLabelHoverCompleteness(mainGraph, plan, 'package', 'react');

		// pair parents of react on main hub: main, Layout, Home, useUser
		expect(plan.activeLabels.has('react')).toBe(true);
		expect(plan.activeLabels.has(MAIN)).toBe(true);
		expect(plan.activeLabels.has('src/components/Layout.tsx')).toBe(true);
		expect(plan.activeLabels.has('src/pages/Home.tsx')).toBe(true);
		expect(plan.activeLabels.has('src/hooks/useUser.ts')).toBe(true);
		// reverse through App / Profile
		expect(plan.activeLabels.has(APP)).toBe(true);
		expect(plan.activeLabels.has('src/pages/Profile.tsx')).toBe(true);
		// forward siblings / off-path
		expect(plan.activeLabels.has('src/lib/logger.ts')).toBe(false);
		expect(plan.activeLabels.has('src/pages/About.tsx')).toBe(false);
		// no other packages
		expect(plan.activeLabels.has('react-dom')).toBe(false);
		expect(plan.activeLabels.has('zod')).toBe(false);

		// inbound straighten into react
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react'))).toBe(true);
		expect(
			plan.focusedBandKeys.has(
				externalBandKey('src/components/Layout.tsx', 'react'),
			),
		).toBe(true);
		expect(
			plan.focusedBandKeys.has(externalBandKey('src/pages/Home.tsx', 'react')),
		).toBe(true);
		expect(
			plan.focusedBandKeys.has(
				externalBandKey('src/hooks/useUser.ts', 'react'),
			),
		).toBe(true);
		// not sibling package bands
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react-dom'))).toBe(
			false,
		);
		// file bands on reverse paths
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, APP))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(APP, 'src/pages/Home.tsx'))).toBe(
			true,
		);
		// About branch not on reverse path
		expect(plan.focusedBandKeys.has(fileBandKey(APP, 'src/pages/About.tsx'))).toBe(
			false,
		);
	});

	it('L-pkg-react-dom: parents of react-dom only (main); not Layout/Home', () => {
		const plan = planFocus(mainGraph, { kind: 'package', name: 'react-dom' });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		assertLabelHoverCompleteness(mainGraph, plan, 'package', 'react-dom');

		expect(plan.activeLabels.has('react-dom')).toBe(true);
		expect(plan.activeLabels.has(MAIN)).toBe(true);
		// reverse from main only — no Layout/Home
		expect(plan.activeLabels.has('src/components/Layout.tsx')).toBe(false);
		expect(plan.activeLabels.has('src/pages/Home.tsx')).toBe(false);
		expect(plan.activeLabels.has(APP)).toBe(false);
		expect(plan.activeLabels.has('react')).toBe(false);
		expect(plan.activeLabels.has('react-router-dom')).toBe(false);

		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react-dom'))).toBe(
			true,
		);
		expect(plan.focusedBandKeys.has(externalBandKey(MAIN, 'react'))).toBe(false);
		// no file bands (main has no reverse ancestors with both ends)
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, APP))).toBe(false);
	});

	it('L-pkg-zod: multi-parent reverse unions (api + types)', () => {
		const plan = planFocus(mainGraph, { kind: 'package', name: 'zod' });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(mainGraph, plan);
		assertLabelHoverCompleteness(mainGraph, plan, 'package', 'zod');

		expect(plan.activeLabels.has('zod')).toBe(true);
		expect(plan.activeLabels.has('src/lib/api.ts')).toBe(true);
		expect(plan.activeLabels.has('src/types.ts')).toBe(true);
		// reverse Home → App → main
		expect(plan.activeLabels.has('src/pages/Home.tsx')).toBe(true);
		expect(plan.activeLabels.has(APP)).toBe(true);
		expect(plan.activeLabels.has(MAIN)).toBe(true);
		// no mesh into unrelated packages
		expect(plan.activeLabels.has('react')).toBe(false);
		expect(plan.activeLabels.has('react-dom')).toBe(false);

		expect(
			plan.focusedBandKeys.has(externalBandKey('src/lib/api.ts', 'zod')),
		).toBe(true);
		expect(plan.focusedBandKeys.has(externalBandKey('src/types.ts', 'zod'))).toBe(
			true,
		);
		expect(plan.focusedBandKeys.has(fileBandKey(MAIN, APP))).toBe(true);
		expect(
			plan.focusedBandKeys.has(fileBandKey(APP, 'src/pages/Home.tsx')),
		).toBe(true);
	});

	it('L-alias: multi-instance types · hN expands aliases + packages of that file id', () => {
		// App hub has types · h3 multi-instance
		const aliasName = Object.keys(appPayload.meta.nodeRef).find(
			(k) =>
				appPayload.meta.nodeRef[k]?.kind === 'file' &&
				appPayload.meta.nodeRef[k]?.id === 'src/types.ts' &&
				k.includes('·'),
		);
		expect(aliasName, 'expected multi-instance types label').toBeTruthy();

		const plan = planFocus(appGraph, { kind: 'file', name: aliasName! });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(appGraph, plan);

		expect(plan.activeLabels.has(aliasName!)).toBe(true);
		expect(plan.activeLabels.has('src/types.ts')).toBe(true);
		// zod pair may attach to base or alias parent — at least package from
		// forward of types instances if pairs point at api/types
		// reverse should reach App / main via importers of types
		expect(plan.activeLabels.has(APP) || plan.activeLabels.has(MAIN)).toBe(
			true,
		);
	});

	it('L-spine: hover File spine = file neighborhood of hub focus file', () => {
		const spine = planFocus(mainGraph, { kind: 'file-spine' });
		const asFile = planFocus(mainGraph, { kind: 'file', name: MAIN });
		assertNoRails(spine);
		expect([...spine.activeLabels].sort()).toEqual(
			[...asFile.activeLabels].sort(),
		);
		expect([...spine.focusedBandKeys].sort()).toEqual(
			[...asFile.focusedBandKeys].sort(),
		);
		expect(mainGraph.fileSpineName).toBe(MAIN);
	});


	it('L-rails: rails never in activeLabels or focusedBandKeys', () => {
		// Inject a rail into a synthetic neighborhood by ensuring build strips them
		const rail = '\u200b·in-rail·h2';
		expect(
			mainGraph.fileEdges.some(
				(e) => e.source === rail || e.target === rail,
			),
		).toBe(false);
		expect(
			mainGraph.externalEdges.some(
				(e) => e.source === rail || e.target === rail,
			),
		).toBe(false);

		for (const seed of [
			{ kind: 'file' as const, name: MAIN },
			{ kind: 'package' as const, name: 'react' },
			{
				kind: 'band' as const,
				source: MAIN,
				target: APP,
				display: 'carbon' as const,
			},
		]) {
			const plan = planFocus(mainGraph, seed);
			assertNoRails(plan);
			expect(plan.activeLabels.has(rail)).toBe(false);
		}

		// payload may contain rails — graph must not
		const payloadRails = mainPayload.data.filter(
			(l) => isAlluvialRailName(l.source) || isAlluvialRailName(l.target),
		);
		expect(payloadRails.length).toBeGreaterThan(0);
	});

	it('L-pkg-react parents ⊆ meta.externalStraightPairs (no mesh invent)', () => {
		const reactParents = new Set(
			(mainPayload.meta.externalStraightPairs ?? [])
				.filter((p) => p.packageName === 'react')
				.map((p) => p.parent),
		);
		const plan = planFocus(mainGraph, { kind: 'package', name: 'react' });
		// every inbound ext key parent must be a true pair parent
		for (const k of plan.focusedBandKeys) {
			if (!k.startsWith('ext:')) continue;
			const rest = k.slice(4);
			const i = rest.indexOf('\0');
			const parent = rest.slice(0, i);
			const pkg = rest.slice(i + 1);
			if (pkg === 'react') {
				expect(reactParents.has(parent), `invented parent ${parent}`).toBe(
					true,
				);
			}
		}
	});
});

/**
 * Codebreaker-shaped shared hook: spine→shell→hook is shortest;
 * shell→A/B→hook are longer co-importer paths and must stay dim.
 */
describe('LogicalFocusGraph L-file-hook (shared-hook shortest-path ancestors)', () => {
	const PAGE = 'app/page.tsx';
	const INDEX = 'app/components/codebreaker/index.tsx';
	const HOOK = 'app/components/codebreaker/useCodebreaker.ts';
	const HOOK_ALIAS = 'app/components/codebreaker/useCodebreaker.ts · h3';
	const BUFFER = 'app/components/codebreaker/components/Buffer.tsx';
	const TIMER = 'app/components/codebreaker/components/Timer.tsx';
	const REDUCER = 'app/components/codebreaker/reducer.ts';
	const TYPES = 'app/components/codebreaker/types.ts';

	function makeHookGraph(opts?: {
		fileSpineName?: string | null;
		withAlias?: boolean;
		/** Drop spine→shell so hook is unreachable forward from spine. */
		orphanHook?: boolean;
	}): LogicalFocusGraph {
		const data = opts?.orphanHook
			? [
					// spine only connects to unrelated leaf; hook is reverse-only mesh
					{ source: PAGE, target: 'app/unrelated.ts' },
					{ source: INDEX, target: HOOK },
					{ source: BUFFER, target: HOOK },
					{ source: TIMER, target: HOOK },
					{ source: HOOK, target: REDUCER },
					{ source: HOOK, target: TYPES },
				]
			: [
					// page → index → hook (shortest = 2)
					{ source: PAGE, target: INDEX },
					{ source: INDEX, target: HOOK },
					// co-importers: longer paths page→index→A→hook
					{ source: INDEX, target: BUFFER },
					{ source: INDEX, target: TIMER },
					{ source: BUFFER, target: HOOK },
					{ source: TIMER, target: HOOK },
					// forward deps of hook
					{ source: HOOK, target: REDUCER },
					{ source: HOOK, target: TYPES },
				];

		const nodeRef: Record<string, { kind: string; id: string }> = {
			[PAGE]: { kind: 'file', id: PAGE },
			[INDEX]: { kind: 'file', id: INDEX },
			[HOOK]: { kind: 'file', id: HOOK },
			[BUFFER]: { kind: 'file', id: BUFFER },
			[TIMER]: { kind: 'file', id: TIMER },
			[REDUCER]: { kind: 'file', id: REDUCER },
			[TYPES]: { kind: 'file', id: TYPES },
			'app/unrelated.ts': { kind: 'file', id: 'app/unrelated.ts' },
		};
		if (opts?.withAlias) {
			nodeRef[HOOK_ALIAS] = { kind: 'file', id: HOOK };
			data.push({ source: INDEX, target: HOOK_ALIAS });
		}

		return buildLogicalFocusGraphFromParts({
			data,
			nodeRef,
			fileSpineName:
				opts?.fileSpineName === undefined ? PAGE : opts.fileSpineName,
		});
	}

	it('L-file-hook: hover hook — spine+shell+hook lit; Buffer/Timer dim; forward lit', () => {
		const graph = makeHookGraph();
		const plan = planFocus(graph, { kind: 'file', name: HOOK });
		assertNoRails(plan);
		assertFocusedBandsSubsetOfLogical(graph, plan);

		// shortest path page → index → hook
		expect(plan.activeLabels.has(PAGE)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(HOOK)).toBe(true);
		// co-importers on longer paths only — dim
		expect(plan.activeLabels.has(BUFFER)).toBe(false);
		expect(plan.activeLabels.has(TIMER)).toBe(false);
		// forward deps of hook
		expect(plan.activeLabels.has(REDUCER)).toBe(true);
		expect(plan.activeLabels.has(TYPES)).toBe(true);

		expect(plan.focusedBandKeys.has(fileBandKey(PAGE, INDEX))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(INDEX, HOOK))).toBe(true);
		expect(plan.focusedBandKeys.has(fileBandKey(BUFFER, HOOK))).toBe(false);
		expect(plan.focusedBandKeys.has(fileBandKey(TIMER, HOOK))).toBe(false);
		expect(plan.focusedBandKeys.has(fileBandKey(HOOK, REDUCER))).toBe(true);
	});

	it('L-file-hook: multi-instance ·hN seed still alias-expands path membership', () => {
		const graph = makeHookGraph({ withAlias: true });
		const plan = planFocus(graph, { kind: 'file', name: HOOK_ALIAS });
		assertNoRails(plan);

		expect(plan.activeLabels.has(HOOK)).toBe(true);
		expect(plan.activeLabels.has(HOOK_ALIAS)).toBe(true);
		expect(plan.activeLabels.has(PAGE)).toBe(true);
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(BUFFER)).toBe(false);
		expect(plan.activeLabels.has(TIMER)).toBe(false);
	});

	it('L-file-hook: null spine falls back to reverseBFS (co-importers lit)', () => {
		const graph = makeHookGraph({ fileSpineName: null });
		const plan = planFocus(graph, { kind: 'file', name: HOOK });
		// reverseBFS lights every importer of the hook
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(BUFFER)).toBe(true);
		expect(plan.activeLabels.has(TIMER)).toBe(true);
		// forward still lit
		expect(plan.activeLabels.has(REDUCER)).toBe(true);
	});

	it('L-file-hook: unreachable from spine falls back to reverseBFS', () => {
		const graph = makeHookGraph({ orphanHook: true });
		const plan = planFocus(graph, { kind: 'file', name: HOOK });
		// hook not forward-reachable from page → reverse fallback
		expect(plan.activeLabels.has(INDEX)).toBe(true);
		expect(plan.activeLabels.has(BUFFER)).toBe(true);
		expect(plan.activeLabels.has(TIMER)).toBe(true);
		// unrelated spine fork not on reverse of hook
		expect(plan.activeLabels.has('app/unrelated.ts')).toBe(false);
		expect(plan.activeLabels.has(REDUCER)).toBe(true);
	});
});
