/**
 * Activate open vs reindex Exact chrome: include-tests reindex must not force
 * Estimate / full reset; new open still resets Exact.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocPrecision, VirtualFile } from '@core/index.ts';
import type { Session } from '@shell/index.ts';
import type { StickyOpenAction } from './enginePrefs.ts';
import {
	createSessionLifecycle,
	resolveDesiredOpenTier,
	type SessionLifecycleDeps,
} from './sessionLifecycle.ts';

/** Minimal DOM so showWorkspaceShell ($) does not throw in Node. */
function installDomStub(): void {
	const el = () => ({
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
			contains: vi.fn(() => false),
		},
	});
	const byId = new Map<string, ReturnType<typeof el>>([
		['atlas-upload', el()],
		['atlas-workspace', el()],
		['atlas-subbar', el()],
	]);
	vi.stubGlobal('document', {
		getElementById: (id: string) => byId.get(id) ?? null,
	});
}

function vf(path: string, content: string): VirtualFile {
	return { path, content, byteLength: content.length };
}

/** Small feed with a test file so include-tests reindex changes the graph. */
const FEED: VirtualFile[] = [
	vf('src/a.ts', 'export const a = 1;\n'),
	vf('src/a.test.ts', 'import { a } from "./a";\nexport {};\n'),
	vf('src/b.ts', 'export const b = 2;\n'),
];

type CallLog = {
	resetExactState: number;
	invalidateExactProvider: number;
	rehydrateExactForGraph: number;
	enableProgramMode: number;
	enableProgramModePreferExact: boolean[];
	enableExactSurfaceMode: number;
	tryAutoExactWhenLocalAvailable: number;
	syncExactChrome: number;
	clearStage: number;
	/** App-layer spine wipe rides only on full resetExactState. */
	spineWiped: number;
	getStickyOpenAction: number;
	persistSessionIfEnabled: number;
};

function mockDeps(opts: {
	locPrecision?: LocPrecision;
	includeTests?: boolean;
	/** Sticky open action; default `auto-local`. */
	stickyAction?: StickyOpenAction;
}): {
	deps: SessionLifecycleDeps;
	log: CallLog;
	getSession: () => Session | null;
	setLocPrecision: (p: LocPrecision) => void;
	setIncludeTests: (on: boolean) => void;
	getLocPrecision: () => LocPrecision;
	setRehydrateFails: (v: boolean) => void;
	setProgramExactMass: (v: boolean) => void;
} {
	const log: CallLog = {
		resetExactState: 0,
		invalidateExactProvider: 0,
		rehydrateExactForGraph: 0,
		enableProgramMode: 0,
		enableProgramModePreferExact: [],
		enableExactSurfaceMode: 0,
		tryAutoExactWhenLocalAvailable: 0,
		syncExactChrome: 0,
		clearStage: 0,
		spineWiped: 0,
		getStickyOpenAction: 0,
		persistSessionIfEnabled: 0,
	};
	let session: Session | null = null;
	let locPrecision: LocPrecision = opts.locPrecision ?? 'estimate';
	let includeTests = opts.includeTests ?? true;
	let rehydrateFails = false;
	let programExactMass = false;
	const stickyAction: StickyOpenAction = opts.stickyAction ?? 'auto-local';

	const deps: SessionLifecycleDeps = {
		getSession: () => session,
		setSession: (s) => {
			session = s;
		},
		setViewStack: vi.fn(),
		setDepthUserSet: vi.fn(),
		setVizMaxDepth: vi.fn(),
		getLocPrecision: () => locPrecision,
		getProgramExactMass: () => programExactMass,
		resetExactState: () => {
			log.resetExactState += 1;
			locPrecision = 'estimate';
			programExactMass = false;
			// Mirrors app.ts: spineFormula only wiped on full reset, not invalidate
			log.spineWiped += 1;
		},
		invalidateExactProvider: () => {
			log.invalidateExactProvider += 1;
			programExactMass = false;
		},
		rehydrateExactForGraph: async () => {
			log.rehydrateExactForGraph += 1;
			if (rehydrateFails) {
				// Mirrors real rehydrate fail: Estimate fallback without full reset
				locPrecision = 'estimate';
				return;
			}
			locPrecision = 'exact';
		},
		enableProgramMode: async (modeOpts) => {
			log.enableProgramMode += 1;
			log.enableProgramModePreferExact.push(
				Boolean(modeOpts?.preferExactMass),
			);
			locPrecision = 'program';
		},
		enableExactSurfaceMode: async () => {
			log.enableExactSurfaceMode += 1;
			locPrecision = 'exact';
		},
		getStickyOpenAction: () => {
			log.getStickyOpenAction += 1;
			return stickyAction;
		},
		syncExactChrome: () => {
			log.syncExactChrome += 1;
		},
		tryAutoExactWhenLocalAvailable: async () => {
			log.tryAutoExactWhenLocalAvailable += 1;
		},
		clearStage: () => {
			log.clearStage += 1;
		},
		renderCatalog: vi.fn(),
		renderTree: vi.fn(),
		navigateReplace: () => true,
		persistSessionIfEnabled: () => {
			log.persistSessionIfEnabled += 1;
		},
		isPersistEnabled: () => false,
		getIncludeTests: () => includeTests,
		setStatus: vi.fn(),
		showWarnings: vi.fn(),
		updateCaption: vi.fn(),
		updateBackButton: vi.fn(),
		syncDepthDropdown: vi.fn(),
	};

	return {
		deps,
		log,
		getSession: () => session,
		setLocPrecision: (p) => {
			locPrecision = p;
		},
		setIncludeTests: (on) => {
			includeTests = on;
		},
		getLocPrecision: () => locPrecision,
		setRehydrateFails: (v: boolean) => {
			rehydrateFails = v;
		},
		setProgramExactMass: (v: boolean) => {
			programExactMass = v;
		},
	};
}

/** Index FEED into the session the same shape openFromFiles would leave. */
async function seedSessionFromFeed(
	deps: SessionLifecycleDeps,
	includeTests: boolean,
): Promise<void> {
	const {
		indexFiles,
		filterFilesByTestInclusion,
		expandPathsForFilter,
	} = await import('@core/index.ts');
	const indexed = filterFilesByTestInclusion(FEED, includeTests);
	const { graph, catalog } = indexFiles(indexed);
	deps.setSession({
		graph,
		catalog,
		startId: catalog.starts[0]?.id ?? null,
		warnings: [],
		expanded: expandPathsForFilter([...graph.files.keys()], ''),
		files: FEED,
	});
}

describe('sessionLifecycle activate kind open vs reindex', () => {
	beforeEach(() => {
		installDomStub();
	});

	it('open (demo) full-resets Exact and tries auto-local Exact', async () => {
		const { deps, log } = mockDeps({ locPrecision: 'exact' });
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');
		await vi.waitFor(() => {
			expect(log.tryAutoExactWhenLocalAvailable).toBe(1);
		});

		expect(log.resetExactState).toBe(1);
		expect(log.spineWiped).toBe(1);
		expect(log.invalidateExactProvider).toBe(0);
		expect(log.rehydrateExactForGraph).toBe(0);
		expect(log.getStickyOpenAction).toBe(1);
		expect(log.enableExactSurfaceMode).toBe(0);
		expect(log.syncExactChrome).toBe(0);
		// reset forces estimate; sticky was auto-local so auto-local only
		expect(deps.getLocPrecision()).toBe('estimate');
	});

	it('open with sticky Exact applies enableExact (not rehydrate) and skips auto-local', async () => {
		const { deps, log } = mockDeps({
			locPrecision: 'estimate',
			stickyAction: 'exact',
		});
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');
		await Promise.resolve();

		expect(log.resetExactState).toBe(1);
		expect(log.getStickyOpenAction).toBe(1);
		expect(log.enableExactSurfaceMode).toBe(1);
		expect(log.rehydrateExactForGraph).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(deps.getLocPrecision()).toBe('exact');
	});

	it('open with sticky demotion (stay-estimate) skips auto-local', async () => {
		const { deps, log } = mockDeps({
			locPrecision: 'exact',
			stickyAction: 'stay-estimate',
		});
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');
		await Promise.resolve();

		expect(log.resetExactState).toBe(1);
		expect(log.getStickyOpenAction).toBe(1);
		expect(log.enableExactSurfaceMode).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(deps.getLocPrecision()).toBe('estimate');
	});

	it('open with sticky Program enables Program and skips auto-local', async () => {
		const { deps, log } = mockDeps({
			locPrecision: 'estimate',
			stickyAction: 'program',
		});
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');
		await Promise.resolve();

		expect(log.enableProgramMode).toBe(1);
		expect(log.enableExactSurfaceMode).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(deps.getLocPrecision()).toBe('program');
	});

	it('reindex with Exact preserves chrome: invalidate + clearStage + rehydrate, no full reset', async () => {
		const ctx = mockDeps({ locPrecision: 'estimate', includeTests: true });
		const life = createSessionLifecycle(ctx.deps);
		await seedSessionFromFeed(ctx.deps, true);
		// User was on Exact before include-tests toggle
		ctx.setLocPrecision('exact');
		// Zero counters after seed (seed does not go through activate)
		const log = ctx.log;
		log.resetExactState = 0;
		log.invalidateExactProvider = 0;
		log.rehydrateExactForGraph = 0;
		log.tryAutoExactWhenLocalAvailable = 0;
		log.syncExactChrome = 0;
		log.clearStage = 0;
		log.spineWiped = 0;

		ctx.setIncludeTests(false);
		life.reindexWithTestInclusion();

		expect(log.resetExactState).toBe(0);
		expect(log.spineWiped).toBe(0);
		expect(log.invalidateExactProvider).toBe(1);
		expect(log.clearStage).toBe(1);
		expect(log.rehydrateExactForGraph).toBe(1);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(log.syncExactChrome).toBe(1);
		// Rehydrate mock keeps/sets exact
		expect(ctx.getLocPrecision()).toBe('exact');
		// Graph dropped the test file
		const s = ctx.getSession();
		expect(s?.graph.files.has('src/a.test.ts')).toBe(false);
		expect(s?.files.some((f) => f.path === 'src/a.test.ts')).toBe(true);
	});

	it('reindex with Estimate skips auto-Exact and does not rehydrate or clearStage', async () => {
		const ctx = mockDeps({ locPrecision: 'estimate', includeTests: true });
		const life = createSessionLifecycle(ctx.deps);
		await seedSessionFromFeed(ctx.deps, true);
		const log = ctx.log;
		log.resetExactState = 0;
		log.invalidateExactProvider = 0;
		log.rehydrateExactForGraph = 0;
		log.tryAutoExactWhenLocalAvailable = 0;
		log.syncExactChrome = 0;
		log.clearStage = 0;
		log.spineWiped = 0;

		ctx.setIncludeTests(false);
		life.reindexWithTestInclusion();

		expect(log.resetExactState).toBe(0);
		expect(log.spineWiped).toBe(0);
		expect(log.invalidateExactProvider).toBe(1);
		expect(log.clearStage).toBe(0);
		expect(log.rehydrateExactForGraph).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(log.syncExactChrome).toBe(1);
		expect(ctx.getLocPrecision()).toBe('estimate');
	});

	it('reindex + Exact with failing rehydrate does not full-reset or auto-Exact', async () => {
		const ctx = mockDeps({ locPrecision: 'estimate', includeTests: true });
		const life = createSessionLifecycle(ctx.deps);
		await seedSessionFromFeed(ctx.deps, true);
		ctx.setLocPrecision('exact');
		ctx.setRehydrateFails(true);
		const log = ctx.log;
		log.resetExactState = 0;
		log.invalidateExactProvider = 0;
		log.rehydrateExactForGraph = 0;
		log.tryAutoExactWhenLocalAvailable = 0;
		log.syncExactChrome = 0;
		log.clearStage = 0;
		log.spineWiped = 0;

		ctx.setIncludeTests(false);
		life.reindexWithTestInclusion();
		// rehydrate is void async; microtask applies failure fallback
		await Promise.resolve();

		expect(log.resetExactState).toBe(0);
		expect(log.spineWiped).toBe(0);
		expect(log.invalidateExactProvider).toBe(1);
		expect(log.clearStage).toBe(1);
		expect(log.rehydrateExactForGraph).toBe(1);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(ctx.getLocPrecision()).toBe('estimate');
	});

	it('reindex with Program re-invokes enableProgramMode (Exact parity)', async () => {
		const ctx = mockDeps({ locPrecision: 'estimate', includeTests: true });
		const life = createSessionLifecycle(ctx.deps);
		await seedSessionFromFeed(ctx.deps, true);
		ctx.setLocPrecision('program');
		ctx.setProgramExactMass(true);
		const log = ctx.log;
		log.resetExactState = 0;
		log.invalidateExactProvider = 0;
		log.rehydrateExactForGraph = 0;
		log.enableProgramMode = 0;
		log.enableProgramModePreferExact = [];
		log.tryAutoExactWhenLocalAvailable = 0;
		log.syncExactChrome = 0;
		log.clearStage = 0;
		log.spineWiped = 0;

		ctx.setIncludeTests(false);
		life.reindexWithTestInclusion();
		await Promise.resolve();

		expect(log.resetExactState).toBe(0);
		expect(log.invalidateExactProvider).toBe(1);
		expect(log.enableProgramMode).toBe(1);
		// Mass always loads inside enableProgramMode; reindex no longer threads preferExactMass
		expect(log.enableProgramModePreferExact).toEqual([false]);
		expect(log.rehydrateExactForGraph).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(log.syncExactChrome).toBe(1);
		expect(ctx.getLocPrecision()).toBe('program');
	});

	it('restore with stored program precision re-invokes enableProgramMode', async () => {
		const ctx = mockDeps({ locPrecision: 'estimate' });
		const life = createSessionLifecycle(ctx.deps);
		const { SESSION_KEY } = await import('./sessionStore.ts');
		const files = [
			{
				path: 'src/a.ts',
				content: 'export const a = 1\n',
				byteLength: 19,
			},
		];
		const store = new Map<string, string>();
		store.set(
			SESSION_KEY,
			JSON.stringify({
				v: 1,
				files,
				startId: 'src/a.ts',
				expanded: ['src'],
				warnings: [],
				savedAt: Date.now(),
				locPrecision: 'program',
			}),
		);
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => {
				store.set(k, v);
			},
			removeItem: (k: string) => {
				store.delete(k);
			},
		});
		ctx.deps.isPersistEnabled = () => true;
		ctx.log.enableProgramMode = 0;
		ctx.log.tryAutoExactWhenLocalAvailable = 0;
		ctx.log.rehydrateExactForGraph = 0;
		ctx.log.enableExactSurfaceMode = 0;

		const ok = life.tryRestoreSession();
		await Promise.resolve();

		expect(ok).toBe(true);
		expect(ctx.log.enableProgramMode).toBe(1);
		expect(ctx.log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(ctx.log.rehydrateExactForGraph).toBe(0);
		expect(ctx.log.enableExactSurfaceMode).toBe(0);
		// Session program wins over sticky auto-local
		expect(ctx.log.getStickyOpenAction).toBe(1);
		vi.unstubAllGlobals();
		installDomStub();
	});

	it('restore with stored exact precision uses enableExactSurfaceMode (not rehydrate)', async () => {
		const ctx = mockDeps({
			locPrecision: 'estimate',
			// Sticky would also say exact — restore still uses enable path
			stickyAction: 'exact',
		});
		const life = createSessionLifecycle(ctx.deps);
		const { SESSION_KEY } = await import('./sessionStore.ts');
		const files = [
			{
				path: 'src/a.ts',
				content: 'export const a = 1\n',
				byteLength: 19,
			},
		];
		const store = new Map<string, string>();
		store.set(
			SESSION_KEY,
			JSON.stringify({
				v: 1,
				files,
				startId: 'src/a.ts',
				expanded: ['src'],
				warnings: [],
				savedAt: Date.now(),
				locPrecision: 'exact',
			}),
		);
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => {
				store.set(k, v);
			},
			removeItem: (k: string) => {
				store.delete(k);
			},
		});
		ctx.deps.isPersistEnabled = () => true;
		ctx.log.enableExactSurfaceMode = 0;
		ctx.log.rehydrateExactForGraph = 0;
		ctx.log.tryAutoExactWhenLocalAvailable = 0;

		const ok = life.tryRestoreSession();
		await Promise.resolve();

		expect(ok).toBe(true);
		expect(ctx.log.enableExactSurfaceMode).toBe(1);
		expect(ctx.log.rehydrateExactForGraph).toBe(0);
		expect(ctx.log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(ctx.getLocPrecision()).toBe('exact');
		vi.unstubAllGlobals();
		installDomStub();
	});

	it('restore estimate falls through to sticky Exact (enable, not rehydrate)', async () => {
		const ctx = mockDeps({
			locPrecision: 'estimate',
			stickyAction: 'exact',
		});
		const life = createSessionLifecycle(ctx.deps);
		const { SESSION_KEY } = await import('./sessionStore.ts');
		const files = [
			{
				path: 'src/a.ts',
				content: 'export const a = 1\n',
				byteLength: 19,
			},
		];
		const store = new Map<string, string>();
		store.set(
			SESSION_KEY,
			JSON.stringify({
				v: 1,
				files,
				startId: 'src/a.ts',
				expanded: ['src'],
				warnings: [],
				savedAt: Date.now(),
				locPrecision: 'estimate',
			}),
		);
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => {
				store.set(k, v);
			},
			removeItem: (k: string) => {
				store.delete(k);
			},
		});
		ctx.deps.isPersistEnabled = () => true;

		const ok = life.tryRestoreSession();
		await Promise.resolve();

		expect(ok).toBe(true);
		expect(ctx.log.enableExactSurfaceMode).toBe(1);
		expect(ctx.log.rehydrateExactForGraph).toBe(0);
		expect(ctx.log.tryAutoExactWhenLocalAvailable).toBe(0);
		vi.unstubAllGlobals();
		installDomStub();
	});

	it('open with desired Exact defers mid-flight session persist', async () => {
		const { deps, log } = mockDeps({
			locPrecision: 'estimate',
			stickyAction: 'exact',
		});
		// Persist checkbox on so activate would write if not deferred
		deps.isPersistEnabled = () => true;
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');
		await Promise.resolve();

		// Desired exact → skip immediate persist (settle path owns write)
		expect(log.persistSessionIfEnabled).toBe(0);
		expect(log.enableExactSurfaceMode).toBe(1);
	});
});

describe('resolveDesiredOpenTier', () => {
	it('session exact|program wins over sticky', () => {
		expect(resolveDesiredOpenTier('exact', 'program')).toBe('exact');
		expect(resolveDesiredOpenTier('program', 'exact')).toBe('program');
	});

	it('maps sticky when restore is estimate or missing', () => {
		expect(resolveDesiredOpenTier('estimate', 'exact')).toBe('exact');
		expect(resolveDesiredOpenTier(undefined, 'program')).toBe('program');
		expect(resolveDesiredOpenTier(undefined, 'stay-estimate')).toBe(
			'estimate',
		);
		expect(resolveDesiredOpenTier(undefined, 'auto-local')).toBe(
			'auto-local',
		);
	});
});

describe('sessionLifecycle activate when auto-start hub fails', () => {
	beforeEach(() => {
		installDomStub();
	});

	it('paints tree when preferred navigateReplace fails and no later start opens', () => {
		const { deps } = mockDeps({ locPrecision: 'estimate' });
		// Prefer fails; remaining starts (if any) also fail → still paint tree
		deps.navigateReplace = vi.fn(() => false);
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');

		expect(deps.navigateReplace).toHaveBeenCalled();
		expect(deps.renderTree).toHaveBeenCalled();
	});

	it('falls through to a subsequent start when first navigateReplace fails', () => {
		const { deps } = mockDeps({ locPrecision: 'estimate' });
		const opened: string[] = [];
		deps.navigateReplace = vi.fn((view) => {
			// viewForFileOpen → { kind: 'file-hub', fileId }
			const id =
				view && typeof view === 'object' && 'fileId' in view
					? String((view as { fileId: string }).fileId)
					: '';
			opened.push(id);
			// Fail only the first attempt
			return opened.length > 1;
		});
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');

		expect(deps.navigateReplace).toHaveBeenCalled();
		expect(opened.length).toBeGreaterThan(1);
		// Successful open commits chrome via navigateReplace; tree paint is inside commit
		// so we must not force renderTree on success path
		// (renderTree only when all opens fail)
	});

	it('does not call renderTree when first navigateReplace succeeds', () => {
		const { deps } = mockDeps({ locPrecision: 'estimate' });
		deps.navigateReplace = vi.fn(() => true);
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');

		expect(deps.navigateReplace).toHaveBeenCalledTimes(1);
		expect(deps.renderTree).not.toHaveBeenCalled();
	});
});
