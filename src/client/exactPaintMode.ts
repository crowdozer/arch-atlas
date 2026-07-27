/**
 * Exact paint orchestration (web host).
 *
 * Extracted from the composition root: enable / disable / auto-local / reset.
 * Injected deps keep module state ownership in `app.ts` (no session framework).
 * Engine load lives in host-shared `@exact` — this module is web paint/chrome only.
 */

import {
	graphNeedsTypescript,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type WeightAxis,
} from '@core/index.ts';
import {
	ensureExactForGraph,
	ensureExactLocalOnly,
	isLocalExactSource,
	type EnsureExactResult,
} from '@exact/index.ts';
import {
	statusForView,
	type AtlasView,
	type Session,
} from '@shell/index.ts';
import { $ } from './dom.ts';

export type ExactPaintModeDeps = {
	getSession: () => Session | null;
	getSurfaceProvider: () => ImportedSurfaceProvider | null;
	setSurfaceProvider: (p: ImportedSurfaceProvider | null) => void;
	getLocPrecision: () => LocPrecision;
	setLocPrecision: (p: LocPrecision) => void;
	getWeightAxis: () => WeightAxis;
	setWeightAxis: (a: WeightAxis) => void;
	getExactEnableInFlight: () => boolean;
	setExactEnableInFlight: (v: boolean) => void;
	getExactMixedWarningShown: () => boolean;
	setExactMixedWarningShown: (v: boolean) => void;
	remountCurrentView: () => void;
	setStatus: (msg: string) => void;
	openUnavailableModal: (opts: {
		label: string;
		heading: string;
		body: string;
	}) => void;
	syncPrecisionDropdown: (
		el: HTMLElement & { value?: string },
		precision: LocPrecision,
	) => void;
	syncWeightDropdown: (
		el: HTMLElement & { value?: string },
		axis: WeightAxis,
	) => void;
	currentView: () => AtlasView | null;
};

export type ExactPaintMode = {
	enableExactSurfaceMode: (trigger: 'precision' | 'shaken') => Promise<void>;
	disableExactPaintMode: () => void;
	tryAutoExactWhenLocalAvailable: () => Promise<void>;
	/** Full Exact chrome reset (new ZIP/demo/open). Forces Estimate. */
	resetExactState: () => void;
	/**
	 * Graph contents changed (e.g. include-tests reindex): drop provider so
	 * Exact mass cannot bind to a stale file set. Does **not** change
	 * locPrecision / weightAxis (caller rehydrates or stays Estimate).
	 * Bumps graph generation so in-flight rehydrate installs are discarded.
	 */
	invalidateExactProvider: () => void;
	/**
	 * Rebuild Exact provider for the current session graph after invalidate.
	 * On failure: fall back to Estimate with honest status (same as enable).
	 * Preserves weightAxis; syncs Precision dropdown to exact on success.
	 * Stale after a later invalidate (generation token).
	 */
	rehydrateExactForGraph: () => Promise<void>;
	/** Sync Precision / Weight Carbon dropdowns to current module state. */
	syncExactChrome: () => void;
};

/** Shared install path after ensureExact succeeds or fails. */
type InstallExactOpts = {
	/** Unavailable / failed modal chrome label. */
	modalLabel: string;
	/** Status while ensureExact is in flight. */
	loadingStatus: string;
	/**
	 * `force-target-loc` — enable path (Exact always pairs with target-loc mass).
	 * `preserve` — reindex rehydrate keeps weightAxis chrome.
	 */
	weight: 'force-target-loc' | 'preserve';
	/**
	 * After force-target-loc: Carbon control value.
	 * Shaken entry shows `imported-loc` UI while axis stays target-loc.
	 */
	weightUi?: 'target-loc' | 'imported-loc';
	/** Appended to success status (e.g. ` · reindexed`). */
	statusSuffix?: string;
	/**
	 * When set, discard ensure result if graph generation moved (rapid reindex).
	 * Caller snapshots generation before await.
	 */
	generation?: number;
};

/**
 * Enter Exact surface mode (Precision Exact or Weight Shaken).
 * Loads TS engine if needed, installs provider, syncs controls, remounts.
 * Does **not** re-index the graph.
 */
export function createExactPaintMode(deps: ExactPaintModeDeps): ExactPaintMode {
	/**
	 * Bumped on graph-file-set invalidate. In-flight rehydrate captures the
	 * value at start and drops the result when it no longer matches.
	 */
	let exactGraphGeneration = 0;

	function precisionDropdown(): (HTMLElement & { value?: string }) | null {
		return $('atlas-loc-precision') as (HTMLElement & { value?: string }) | null;
	}

	function weightDropdown(): (HTMLElement & { value?: string }) | null {
		return $('atlas-weight-axis') as (HTMLElement & { value?: string }) | null;
	}

	function engineSrcNote(source: string): string {
		if (source === 'jsdelivr' || source === 'unpkg') {
			return ` · engine ${source} (CDN)`;
		}
		if (source === 'local' || source === 'inject') {
			return ` · engine ${source}`;
		}
		if (source === 'cached') return ' · engine cached';
		return '';
	}

	/** Fall back to Estimate chrome + remount (honesty after ensure failure). */
	function fallBackEstimate(opts: {
		msg: string;
		modalLabel: string;
		heading: string;
		body: string;
	}): void {
		const precEl = precisionDropdown();
		const weightEl = weightDropdown();
		deps.setLocPrecision('estimate');
		if (precEl) deps.syncPrecisionDropdown(precEl, 'estimate');
		if (weightEl) {
			deps.syncWeightDropdown(weightEl, deps.getWeightAxis());
		}
		deps.openUnavailableModal({
			label: opts.modalLabel,
			heading: opts.heading,
			body: opts.body,
		});
		deps.remountCurrentView();
		deps.setStatus(opts.msg);
	}

	/**
	 * Install Exact chrome from an ensureExact result (shared by enable + rehydrate).
	 * Returns whether install applied (`stale` when generation advanced).
	 */
	function applyEnsureResult(
		result: EnsureExactResult,
		opts: InstallExactOpts,
	): 'ok' | 'fail' | 'stale' {
		if (
			opts.generation !== undefined &&
			opts.generation !== exactGraphGeneration
		) {
			return 'stale';
		}

		if (!result.ok) {
			fallBackEstimate({
				msg: result.error,
				modalLabel: opts.modalLabel,
				heading: 'Export surface unavailable',
				body:
					result.error +
					' Charts stay on estimate (whole-file / dual-side estimate) weights. Exact is not a language server.',
			});
			return 'fail';
		}

		deps.setSurfaceProvider(result.provider);
		deps.setLocPrecision('exact');

		const precEl = precisionDropdown();
		const weightEl = weightDropdown();

		if (opts.weight === 'force-target-loc') {
			deps.setWeightAxis('target-loc');
			if (precEl) deps.syncPrecisionDropdown(precEl, 'exact');
			if (weightEl) {
				const ui = opts.weightUi ?? 'target-loc';
				if (ui === 'imported-loc') {
					// Shaken entry: control shows export-surface UI value; axis is target-loc
					weightEl.value = 'imported-loc';
					weightEl.setAttribute('value', 'imported-loc');
				} else {
					deps.syncWeightDropdown(weightEl, 'target-loc');
				}
			}
		} else {
			// preserve weightAxis (reindex chrome)
			if (precEl) deps.syncPrecisionDropdown(precEl, 'exact');
			if (weightEl) {
				deps.syncWeightDropdown(weightEl, deps.getWeightAxis());
			}
		}

		const missing = result.engines.missing;
		if (missing.length && !deps.getExactMixedWarningShown()) {
			deps.setExactMixedWarningShown(true);
			const langs = missing.map((m) => m.language).join(', ');
			deps.openUnavailableModal({
				label: 'Export surface (partial)',
				heading: 'Only JavaScript/TypeScript use Exact',
				body: `Export-surface mass applies to JS/TS import edges only (export declarations matched to bindings — not a full language server). Other languages in this project (${langs}) stay on estimate until engines exist.`,
			});
		}

		const srcNote = engineSrcNote(result.source);
		const suffix = opts.statusSuffix ?? '';
		deps.remountCurrentView();
		deps.setStatus(
			`Export-surface Exact on (JS/TS export decls)${srcNote}${suffix}`,
		);
		return 'ok';
	}

	/**
	 * Shared ensure → install pipeline for user enable and reindex rehydrate.
	 * Generation discard only when `opts.generation` is set (rehydrate).
	 */
	async function installExactFromEnsure(
		opts: InstallExactOpts,
	): Promise<'ok' | 'fail' | 'stale' | 'busy' | 'nosession'> {
		const session = deps.getSession();
		if (!session) return 'nosession';

		// Exclusive for user enable; rehydrate may overlap after invalidate resets flight
		if (opts.generation === undefined && deps.getExactEnableInFlight()) {
			return 'busy';
		}

		deps.setExactEnableInFlight(true);
		const myGen = opts.generation;

		try {
			deps.setStatus(opts.loadingStatus);
			const result = await ensureExactForGraph(session.graph, {
				cachedProvider: deps.getSurfaceProvider(),
			});

			if (myGen !== undefined && myGen !== exactGraphGeneration) {
				return 'stale';
			}

			return applyEnsureResult(result, opts);
		} catch (e) {
			if (myGen !== undefined && myGen !== exactGraphGeneration) {
				return 'stale';
			}
			const msg = e instanceof Error ? e.message : String(e);
			fallBackEstimate({
				msg,
				modalLabel: opts.modalLabel,
				heading: 'Export surface failed',
				body: msg + ' Charts stay on estimate weights.',
			});
			return 'fail';
		} finally {
			// Only clear flight if we still own this generation (or no gen = enable)
			if (myGen === undefined || myGen === exactGraphGeneration) {
				deps.setExactEnableInFlight(false);
			}
		}
	}

	async function enableExactSurfaceMode(
		trigger: 'precision' | 'shaken',
	): Promise<void> {
		const session = deps.getSession();
		if (!session) {
			deps.setStatus('Open a project before enabling Exact mode');
			return;
		}

		const outcome = await installExactFromEnsure({
			modalLabel: trigger === 'shaken' ? 'Weight' : 'Precision',
			loadingStatus: 'Loading JS/TS export-surface engine…',
			weight: 'force-target-loc',
			weightUi: trigger === 'shaken' ? 'imported-loc' : 'target-loc',
		});
		if (outcome === 'nosession') {
			deps.setStatus('Open a project before enabling Exact mode');
		}
	}

	/** Leave Exact paint mode (keep provider cached for re-entry). */
	function disableExactPaintMode(): void {
		deps.setLocPrecision('estimate');
		const precEl = precisionDropdown();
		if (precEl) deps.syncPrecisionDropdown(precEl, 'estimate');
		deps.remountCurrentView();
	}

	/**
	 * Default Exact **on** when a local/injected analysis engine is already available.
	 * Never triggers CDN download — production web stays estimate until user opts in.
	 * Silent no-op when local classic TS is missing (dev without dep, pure CDN hosts).
	 */
	async function tryAutoExactWhenLocalAvailable(): Promise<void> {
		const session = deps.getSession();
		if (!session || deps.getExactEnableInFlight()) return;
		if (deps.getLocPrecision() === 'exact' && deps.getSurfaceProvider()) return;

		const needsTs = graphNeedsTypescript(session.graph);
		const hasSurfaceInject = (() => {
			try {
				return !!(
					globalThis as typeof globalThis & {
						__ARCH_ATLAS_SURFACE__?: ImportedSurfaceProvider;
					}
				).__ARCH_ATLAS_SURFACE__;
			} catch {
				return false;
			}
		})();
		// No JS/TS and no host inject → stay estimate (empty provider is not auto)
		if (!needsTs && !hasSurfaceInject) return;

		deps.setExactEnableInFlight(true);
		const precEl = precisionDropdown();
		const weightEl = weightDropdown();

		try {
			const result = await ensureExactLocalOnly(session.graph, {
				cachedProvider: deps.getSurfaceProvider(),
			});
			if (!result.ok || !isLocalExactSource(result.source)) return;
			// Synthetic empty provider is not a real local engine
			if (result.source === 'empty') return;

			deps.setSurfaceProvider(result.provider);
			deps.setLocPrecision('exact');
			deps.setWeightAxis('target-loc');
			if (precEl) deps.syncPrecisionDropdown(precEl, 'exact');
			if (weightEl) deps.syncWeightDropdown(weightEl, 'target-loc');
			// No mixed-language modal on auto — user can still open Exact explicitly later
			deps.remountCurrentView();
			const view = deps.currentView();
			const base = view ? statusForView(view) : 'Project open';
			deps.setStatus(`${base} · export-surface Exact (${result.source})`);
		} catch {
			// stay estimate
		} finally {
			deps.setExactEnableInFlight(false);
		}
	}

	/** Drop Exact paint + provider cache when graph identity changes (new open). */
	function resetExactState(): void {
		exactGraphGeneration += 1;
		deps.setSurfaceProvider(null);
		deps.setLocPrecision('estimate');
		deps.setExactMixedWarningShown(false);
		deps.setExactEnableInFlight(false);
		const precEl = precisionDropdown();
		if (precEl) deps.syncPrecisionDropdown(precEl, 'estimate');
	}

	/**
	 * Clear surface provider after graph file-set change without forcing Estimate.
	 * Mass cache is cleared via host setSurfaceProvider side-effect.
	 * Generation bump discards any in-flight rehydrate for a prior file set.
	 */
	function invalidateExactProvider(): void {
		exactGraphGeneration += 1;
		deps.setSurfaceProvider(null);
		deps.setExactEnableInFlight(false);
	}

	/** Align Precision / Weight controls with JS state (post-reindex chrome truth). */
	function syncExactChrome(): void {
		const precEl = precisionDropdown();
		const weightEl = weightDropdown();
		if (precEl) deps.syncPrecisionDropdown(precEl, deps.getLocPrecision());
		if (weightEl) deps.syncWeightDropdown(weightEl, deps.getWeightAxis());
	}

	/**
	 * Rebuild Exact for the current graph after {@link invalidateExactProvider}.
	 * Reuses shared ensure→install pipeline; preserves weightAxis.
	 * Late completions after a further invalidate are discarded (generation).
	 */
	async function rehydrateExactForGraph(): Promise<void> {
		const session = deps.getSession();
		if (!session) return;
		const generation = exactGraphGeneration;
		await installExactFromEnsure({
			modalLabel: 'Precision',
			loadingStatus: 'Rebuilding export-surface Exact for updated graph…',
			weight: 'preserve',
			statusSuffix: ' · reindexed',
			generation,
		});
	}

	return {
		enableExactSurfaceMode,
		disableExactPaintMode,
		tryAutoExactWhenLocalAvailable,
		resetExactState,
		invalidateExactProvider,
		rehydrateExactForGraph,
		syncExactChrome,
	};
}
