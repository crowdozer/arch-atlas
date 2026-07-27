/**
 * Exact paint: rehydrate failure honesty + generation discard after invalidate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocPrecision, WeightAxis } from '@core/index.ts';
import { indexFiles } from '@core/index.ts';
import type { ImportedSurfaceProvider } from '@core/index.ts';
import type { Session } from '@shell/index.ts';
import {
	createExactPaintMode,
	type ExactPaintModeDeps,
} from './exactPaintMode.ts';

const ensureExactForGraph = vi.fn();

vi.mock('@exact/index.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@exact/index.ts')>();
	return {
		...actual,
		ensureExactForGraph: (...args: unknown[]) => ensureExactForGraph(...args),
	};
});

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
	};
	calls: {
		remount: number;
		modals: { label: string; heading: string; body: string }[];
		statuses: string[];
		precisionSyncs: LocPrecision[];
	};
} {
	const state = {
		locPrecision: 'exact' as LocPrecision,
		weightAxis: 'target-loc' as WeightAxis,
		surfaceProvider: null as ImportedSurfaceProvider | null,
		exactEnableInFlight: false,
		exactMixedWarningShown: false,
		programExactMass: false,
	};
	const calls = {
		remount: 0,
		modals: [] as { label: string; heading: string; body: string }[],
		statuses: [] as string[],
		precisionSyncs: [] as LocPrecision[],
		programApplies: 0,
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
		remountCurrentView: () => {
			calls.remount += 1;
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

describe('exactPaintMode rehydrate honesty', () => {
	beforeEach(() => {
		installDomStub();
		ensureExactForGraph.mockReset();
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
