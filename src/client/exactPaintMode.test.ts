/**
 * Exact paint: rehydrate failure honesty + generation discard after invalidate.
 * Program enableProgramMode orchestration (soft-fail / apply / Exact rehydrate).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocPrecision, WeightAxis } from '@core/index.ts';
import { indexFiles } from '@core/index.ts';
import type { ImportedSurfaceProvider } from '@core/index.ts';
import type { Session } from '@shell/index.ts';
import {
	createExactPaintMode,
	programStatusHonesty,
	type ExactPaintModeDeps,
} from './exactPaintMode.ts';

const ensureExactForGraph = vi.fn();
const runProgramEnrichment = vi.fn();
const cancelProgramEnrichment = vi.fn();

vi.mock('@exact/index.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@exact/index.ts')>();
	return {
		...actual,
		ensureExactForGraph: (...args: unknown[]) => ensureExactForGraph(...args),
	};
});

vi.mock('./programWorkerClient.ts', () => ({
	runProgramEnrichment: (...args: unknown[]) => runProgramEnrichment(...args),
	cancelProgramEnrichment: (...args: unknown[]) =>
		cancelProgramEnrichment(...args),
	createProgramWorkerClient: () => ({
		runProgramEnrichment: (...args: unknown[]) =>
			runProgramEnrichment(...args),
		cancel: () => cancelProgramEnrichment(),
		generation: () => 0,
	}),
	programWorkerClient: {
		runProgramEnrichment: (...args: unknown[]) =>
			runProgramEnrichment(...args),
		cancel: () => cancelProgramEnrichment(),
		generation: () => 0,
	},
}));

function installDomStub(): void {
	const el = (id: string) => {
		const node = {
			id,
			value: '',
			classList: {
				add: vi.fn(),
				remove: vi.fn(),
				contains: vi.fn(() => false),
			},
			setAttribute: vi.fn(),
			getAttribute: vi.fn(),
		};
		return node;
	};
	const byId = new Map([
		['atlas-loc-precision', el('atlas-loc-precision')],
		['atlas-weight-axis', el('atlas-weight-axis')],
	]);
	vi.stubGlobal('document', {
		getElementById: (id: string) => byId.get(id) ?? null,
	});
}

function makeSession(): Session {
	const { graph, catalog } = indexFiles([
		{ path: 'src/a.ts', content: 'export const a = 1;\n', byteLength: 20 },
	]);
	return {
		graph,
		catalog,
		startId: 'src/a.ts',
		warnings: [],
		expanded: new Set(['src']),
		files: [{ path: 'src/a.ts', content: 'export const a = 1;\n', byteLength: 20 }],
	};
}

function mockPaintDeps(session: Session): {
	deps: ExactPaintModeDeps;
	state: {
		locPrecision: LocPrecision;
		weightAxis: WeightAxis;
		surfaceProvider: ImportedSurfaceProvider | null;
		exactEnableInFlight: boolean;
		exactMixedWarningShown: boolean;
		programExactMass: boolean;
		programMetaCleared: number;
	};
	calls: {
		remount: number;
		modals: { label: string; heading: string; body: string }[];
		statuses: string[];
		precisionSyncs: LocPrecision[];
		programApplies: number;
		stageLoading: string[];
	};
} {
	const state = {
		locPrecision: 'exact' as LocPrecision,
		weightAxis: 'target-loc' as WeightAxis,
		surfaceProvider: null as ImportedSurfaceProvider | null,
		exactEnableInFlight: false,
		exactMixedWarningShown: false,
		programExactMass: false,
		programMetaCleared: 0,
	};
	const calls = {
		remount: 0,
		modals: [] as { label: string; heading: string; body: string }[],
		statuses: [] as string[],
		precisionSyncs: [] as LocPrecision[],
		programApplies: 0,
		stageLoading: [] as string[],
	};

	const deps: ExactPaintModeDeps = {
		getSession: () => session,
		getSurfaceProvider: () => state.surfaceProvider,
		setSurfaceProvider: (p) => {
			state.surfaceProvider = p;
		},
		getLocPrecision: () => state.locPrecision,
		setLocPrecision: (p) => {
			state.locPrecision = p;
		},
		getWeightAxis: () => state.weightAxis,
		setWeightAxis: (a) => {
			state.weightAxis = a;
		},
		getExactEnableInFlight: () => state.exactEnableInFlight,
		setExactEnableInFlight: (v) => {
			state.exactEnableInFlight = v;
		},
		getExactMixedWarningShown: () => state.exactMixedWarningShown,
		setExactMixedWarningShown: (v) => {
			state.exactMixedWarningShown = v;
		},
		getProgramExactMass: () => state.programExactMass,
		setProgramExactMass: (v) => {
			state.programExactMass = v;
		},
		applyProgramGraph: () => {
			calls.programApplies += 1;
		},
		clearProgramMeta: () => {
			state.programMetaCleared += 1;
		},
		remountCurrentView: () => {
			calls.remount += 1;
		},
		showStageLoading: (msg) => {
			calls.stageLoading.push(msg);
		},
		setStatus: (msg) => {
			calls.statuses.push(msg);
		},
		openUnavailableModal: (opts) => {
			calls.modals.push(opts);
		},
		syncPrecisionDropdown: (_el, precision) => {
			calls.precisionSyncs.push(precision);
		},
		syncWeightDropdown: vi.fn(),
		currentView: () => null,
	};

	return { deps, state, calls };
}

function okProgramResult(session: Session) {
	return {
		ok: true as const,
		graph: session.graph,
		stats: {
			resolvedCount: 2,
			resolvedAliasCount: 1,
			exportSymbolFileCount: 0,
			rootFileCount: 1,
			tsconfig: 'partial' as const,
			missingLibs: [] as string[],
		},
		thinL3: false,
		exportSymbolCount: new Map<string, number>(),
	};
}

describe('exactPaintMode rehydrate honesty', () => {
	beforeEach(() => {
		installDomStub();
		ensureExactForGraph.mockReset();
		runProgramEnrichment.mockReset();
		cancelProgramEnrichment.mockReset();
	});

	it('rehydrate failure falls back to Estimate + modal + remount; weightAxis preserved', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'exact';
		state.weightAxis = 'target-loc';
		const paint = createExactPaintMode(deps);

		// Provider already dropped as on reindex invalidate
		paint.invalidateExactProvider();
		expect(state.surfaceProvider).toBeNull();

		ensureExactForGraph.mockResolvedValue({
			ok: false,
			error: 'engine unavailable for test',
			engines: { loadable: [], missing: [] },
		});

		await paint.rehydrateExactForGraph();

		expect(state.locPrecision).toBe('estimate');
		expect(state.weightAxis).toBe('target-loc');
		expect(state.surfaceProvider).toBeNull();
		expect(calls.precisionSyncs).toContain('estimate');
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		expect(calls.modals.some((m) => m.heading === 'Export surface unavailable')).toBe(
			true,
		);
		expect(calls.statuses.some((s) => s.includes('engine unavailable'))).toBe(true);
		expect(state.exactEnableInFlight).toBe(false);
	});

	it('rehydrate throw path falls back to Estimate with failed modal', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'exact';
		const paint = createExactPaintMode(deps);
		paint.invalidateExactProvider();

		ensureExactForGraph.mockRejectedValue(new Error('network boom'));

		await paint.rehydrateExactForGraph();

		expect(state.locPrecision).toBe('estimate');
		expect(calls.modals.some((m) => m.heading === 'Export surface failed')).toBe(
			true,
		);
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		expect(calls.statuses.at(-1)).toBe('network boom');
	});

	it('stale rehydrate after second invalidate does not install provider', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'exact';
		const paint = createExactPaintMode(deps);

		let resolveEnsure!: (v: unknown) => void;
		ensureExactForGraph.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveEnsure = resolve;
				}),
		);

		paint.invalidateExactProvider();
		const first = paint.rehydrateExactForGraph();

		// Second include-tests toggle while first ensure still in flight
		paint.invalidateExactProvider();
		const provider2 = { targetSurfaceMass: () => 1 };
		ensureExactForGraph.mockResolvedValue({
			ok: true,
			provider: provider2,
			engines: { loadable: ['typescript'], missing: [] },
			source: 'local',
		});
		const second = paint.rehydrateExactForGraph();

		// Complete the *first* (stale) ensure with a different provider
		resolveEnsure!({
			ok: true,
			provider: { targetSurfaceMass: () => 99 },
			engines: { loadable: ['typescript'], missing: [] },
			source: 'local',
		});
		await first;
		await second;

		// Latest rehydrate wins; stale install discarded
		expect(state.surfaceProvider).toBe(provider2);
		expect(state.locPrecision).toBe('exact');
		expect(calls.remount).toBeGreaterThanOrEqual(1);
	});

	it('enableExactSurfaceMode reuses install path on success', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'estimate';
		const paint = createExactPaintMode(deps);
		const provider = { targetSurfaceMass: () => 2 };
		ensureExactForGraph.mockResolvedValue({
			ok: true,
			provider,
			engines: { loadable: ['typescript'], missing: [] },
			source: 'local',
		});

		await paint.enableExactSurfaceMode('precision');

		expect(state.locPrecision).toBe('exact');
		expect(state.weightAxis).toBe('target-loc');
		expect(state.surfaceProvider).toBe(provider);
		expect(calls.remount).toBe(1);
		expect(calls.statuses.at(-1)).toMatch(/Export-surface Exact on/);
	});
});

describe('enableProgramMode orchestration', () => {
	beforeEach(() => {
		installDomStub();
		ensureExactForGraph.mockReset();
		runProgramEnrichment.mockReset();
		cancelProgramEnrichment.mockReset();
	});

	it('showStageLoading is called before enrich resolves', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'estimate';
		const paint = createExactPaintMode(deps);

		let resolveEnrich!: (v: unknown) => void;
		runProgramEnrichment.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveEnrich = resolve;
				}),
		);

		const pending = paint.enableProgramMode();

		// Flight started: loading must appear before enrich settles
		expect(calls.stageLoading).toEqual(['Building Program topology…']);
		expect(calls.remount).toBe(0);
		expect(calls.programApplies).toBe(0);

		resolveEnrich!(okProgramResult(session));
		await pending;

		expect(calls.programApplies).toBe(1);
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		expect(state.exactEnableInFlight).toBe(false);
	});

	it('soft-fail restores prior precision, remounts, no apply, L1 status', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'estimate';
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue({
			ok: false,
			error: 'no createProgram in worker',
		});

		await paint.enableProgramMode();

		expect(calls.stageLoading).toEqual(['Building Program topology…']);
		expect(calls.programApplies).toBe(0);
		expect(state.locPrecision).toBe('estimate');
		expect(state.programExactMass).toBe(false);
		expect(state.programMetaCleared).toBe(1);
		expect(calls.precisionSyncs).toContain('estimate');
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		expect(calls.statuses.at(-1)).toMatch(/graph left at L1/);
		expect(calls.statuses.at(-1)).toMatch(/not LSP/);
		expect(state.exactEnableInFlight).toBe(false);
		expect(ensureExactForGraph).not.toHaveBeenCalled();
	});

	it('soft-fail from Exact restores exact chrome without apply', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		const provider = { targetSurfaceMass: () => 3 };
		state.locPrecision = 'exact';
		state.surfaceProvider = provider;
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue({
			ok: false,
			error: 'timeout',
			timeout: true,
		});

		await paint.enableProgramMode();

		expect(calls.stageLoading).toEqual(['Building Program topology…']);
		expect(calls.programApplies).toBe(0);
		expect(state.locPrecision).toBe('exact');
		expect(state.surfaceProvider).toBe(provider);
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		expect(calls.statuses.at(-1)).toMatch(/Program unavailable/);
	});

	it('success from estimate applies once, remounts, no Exact rehydrate', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'estimate';
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue(okProgramResult(session));

		await paint.enableProgramMode();

		expect(calls.stageLoading).toEqual(['Building Program topology…']);
		expect(calls.programApplies).toBe(1);
		expect(state.locPrecision).toBe('program');
		expect(state.programExactMass).toBe(false);
		expect(ensureExactForGraph).not.toHaveBeenCalled();
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		expect(calls.statuses.at(-1)).toMatch(/Program: resolved 2/);
		expect(calls.statuses.at(-1)).toMatch(/L2 re-resolve/);
		expect(calls.statuses.at(-1)).toMatch(/not LSP/);
		expect(state.exactEnableInFlight).toBe(false);
	});

	it('success from Exact applies + rehydrates Exact mass (programExactMass)', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'exact';
		state.surfaceProvider = { targetSurfaceMass: () => 1 };
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue(okProgramResult(session));
		const newProvider = { targetSurfaceMass: () => 9 };
		ensureExactForGraph.mockResolvedValue({
			ok: true,
			provider: newProvider,
			engines: { loadable: ['typescript'], missing: [] },
			source: 'local',
		});

		await paint.enableProgramMode();

		expect(calls.programApplies).toBe(1);
		expect(state.locPrecision).toBe('program');
		expect(state.programExactMass).toBe(true);
		expect(state.surfaceProvider).toBe(newProvider);
		expect(ensureExactForGraph).toHaveBeenCalledTimes(1);
		expect(calls.statuses.at(-1)).toMatch(/Exact mass rehydrated/);
	});

	it('preferExactMass rehydrates Exact even when chrome already program', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'program';
		state.surfaceProvider = null;
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue(okProgramResult(session));
		const provider = { targetSurfaceMass: () => 4 };
		ensureExactForGraph.mockResolvedValue({
			ok: true,
			provider,
			engines: { loadable: ['typescript'], missing: [] },
			source: 'local',
		});

		await paint.enableProgramMode({ preferExactMass: true });

		expect(calls.programApplies).toBe(1);
		expect(state.programExactMass).toBe(true);
		expect(state.surfaceProvider).toBe(provider);
		expect(ensureExactForGraph).toHaveBeenCalled();
	});

	it('cancelled with live session remounts prior graph (no soft-fail toast)', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'estimate';
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue({
			ok: false,
			error: 'Program enrich cancelled (stale generation)',
			cancelled: true,
		});

		await paint.enableProgramMode();

		expect(calls.stageLoading).toEqual(['Building Program topology…']);
		expect(calls.programApplies).toBe(0);
		// Live session: remount prior graph so loading placeholder is not sticky
		expect(calls.remount).toBeGreaterThanOrEqual(1);
		// Loading status may have been set; must not clobber with soft-fail L1 line
		expect(calls.statuses.some((s) => s.includes('graph left at L1'))).toBe(
			false,
		);
		expect(state.programMetaCleared).toBe(0);
		expect(state.exactEnableInFlight).toBe(false);
	});

	it('cancelled with no session skips remount (new open owns paint)', async () => {
		const session = makeSession();
		const { deps, state, calls } = mockPaintDeps(session);
		state.locPrecision = 'estimate';
		// enableProgramMode checks session at start; cancel path re-checks
		let callsToGet = 0;
		deps.getSession = () => {
			callsToGet += 1;
			// Start needs session; after cancel host may already have cleared it
			return callsToGet === 1 ? session : null;
		};
		const paint = createExactPaintMode(deps);

		runProgramEnrichment.mockResolvedValue({
			ok: false,
			error: 'Program enrich cancelled (stale generation)',
			cancelled: true,
		});

		await paint.enableProgramMode();

		expect(calls.programApplies).toBe(0);
		expect(calls.remount).toBe(0);
		expect(calls.statuses.some((s) => s.includes('graph left at L1'))).toBe(
			false,
		);
		expect(state.exactEnableInFlight).toBe(false);
	});

	it('programStatusHonesty evidence-gates L2/L3', () => {
		const noResolve = programStatusHonesty({
			resolvedCount: 0,
			resolvedAliasCount: 0,
			thinL3: false,
			tsconfig: 'none',
			missingLibs: [],
		});
		expect(noResolve).not.toMatch(/L2/);
		expect(noResolve).not.toMatch(/thin L3/);
		expect(noResolve).toMatch(/not LSP/);

		const withL2 = programStatusHonesty({
			resolvedCount: 3,
			resolvedAliasCount: 2,
			thinL3: true,
			tsconfig: 'partial',
			missingLibs: [],
		});
		expect(withL2).toMatch(/L2 re-resolve/);
		expect(withL2).toMatch(/thin L3/);
		expect(withL2).toMatch(/alias 2/);
	});
});
