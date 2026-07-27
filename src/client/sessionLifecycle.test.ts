/**
 * Activate open vs reindex Exact chrome: include-tests reindex must not force
 * Estimate / full reset; new open still resets Exact.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocPrecision, VirtualFile } from '@core/index.ts';
import type { Session } from '@shell/index.ts';
import {
	createSessionLifecycle,
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
	tryAutoExactWhenLocalAvailable: number;
	syncExactChrome: number;
	/** App-layer spine wipe rides only on full resetExactState. */
	spineWiped: number;
};

function mockDeps(opts: {
	locPrecision?: LocPrecision;
	includeTests?: boolean;
}): {
	deps: SessionLifecycleDeps;
	log: CallLog;
	getSession: () => Session | null;
	setLocPrecision: (p: LocPrecision) => void;
	setIncludeTests: (on: boolean) => void;
	getLocPrecision: () => LocPrecision;
} {
	const log: CallLog = {
		resetExactState: 0,
		invalidateExactProvider: 0,
		rehydrateExactForGraph: 0,
		tryAutoExactWhenLocalAvailable: 0,
		syncExactChrome: 0,
		spineWiped: 0,
	};
	let session: Session | null = null;
	let locPrecision: LocPrecision = opts.locPrecision ?? 'estimate';
	let includeTests = opts.includeTests ?? true;

	const deps: SessionLifecycleDeps = {
		getSession: () => session,
		setSession: (s) => {
			session = s;
		},
		setViewStack: vi.fn(),
		setDepthUserSet: vi.fn(),
		setVizMaxDepth: vi.fn(),
		getLocPrecision: () => locPrecision,
		resetExactState: () => {
			log.resetExactState += 1;
			locPrecision = 'estimate';
			// Mirrors app.ts: spineFormula only wiped on full reset, not invalidate
			log.spineWiped += 1;
		},
		invalidateExactProvider: () => {
			log.invalidateExactProvider += 1;
		},
		rehydrateExactForGraph: async () => {
			log.rehydrateExactForGraph += 1;
			locPrecision = 'exact';
		},
		syncExactChrome: () => {
			log.syncExactChrome += 1;
		},
		tryAutoExactWhenLocalAvailable: async () => {
			log.tryAutoExactWhenLocalAvailable += 1;
		},
		clearStage: vi.fn(),
		renderCatalog: vi.fn(),
		renderTree: vi.fn(),
		navigateReplace: () => true,
		persistSessionIfEnabled: vi.fn(),
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

	it('open (demo) full-resets Exact and tries auto-local Exact', () => {
		const { deps, log } = mockDeps({ locPrecision: 'exact' });
		const life = createSessionLifecycle(deps);

		life.handleDemo('react-simple');

		expect(log.resetExactState).toBe(1);
		expect(log.spineWiped).toBe(1);
		expect(log.invalidateExactProvider).toBe(0);
		expect(log.rehydrateExactForGraph).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(1);
		expect(log.syncExactChrome).toBe(0);
		expect(deps.getLocPrecision()).toBe('estimate');
	});

	it('reindex with Exact preserves chrome: invalidate + rehydrate, no full reset', async () => {
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
		log.spineWiped = 0;

		ctx.setIncludeTests(false);
		life.reindexWithTestInclusion();

		expect(log.resetExactState).toBe(0);
		expect(log.spineWiped).toBe(0);
		expect(log.invalidateExactProvider).toBe(1);
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

	it('reindex with Estimate skips auto-Exact and does not rehydrate', async () => {
		const ctx = mockDeps({ locPrecision: 'estimate', includeTests: true });
		const life = createSessionLifecycle(ctx.deps);
		await seedSessionFromFeed(ctx.deps, true);
		const log = ctx.log;
		log.resetExactState = 0;
		log.invalidateExactProvider = 0;
		log.rehydrateExactForGraph = 0;
		log.tryAutoExactWhenLocalAvailable = 0;
		log.syncExactChrome = 0;
		log.spineWiped = 0;

		ctx.setIncludeTests(false);
		life.reindexWithTestInclusion();

		expect(log.resetExactState).toBe(0);
		expect(log.spineWiped).toBe(0);
		expect(log.invalidateExactProvider).toBe(1);
		expect(log.rehydrateExactForGraph).toBe(0);
		expect(log.tryAutoExactWhenLocalAvailable).toBe(0);
		expect(log.syncExactChrome).toBe(1);
		expect(ctx.getLocPrecision()).toBe('estimate');
	});
});
