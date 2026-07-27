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
	 */
	invalidateExactProvider: () => void;
	/**
	 * Rebuild Exact provider for the current session graph after invalidate.
	 * On failure: fall back to Estimate with honest status (same as enable).
	 * Preserves weightAxis; syncs Precision dropdown to exact on success.
	 */
	rehydrateExactForGraph: () => Promise<void>;
	/** Sync Precision / Weight Carbon dropdowns to current module state. */
	syncExactChrome: () => void;
};

/**
 * Enter Exact surface mode (Precision Exact or Weight Shaken).
 * Loads TS engine if needed, installs provider, syncs controls, remounts.
 * Does **not** re-index the graph.
 */
export function createExactPaintMode(deps: ExactPaintModeDeps): ExactPaintMode {
	function precisionDropdown(): (HTMLElement & { value?: string }) | null {
		return $('atlas-loc-precision') as (HTMLElement & { value?: string }) | null;
	}

	function weightDropdown(): (HTMLElement & { value?: string }) | null {
		return $('atlas-weight-axis') as (HTMLElement & { value?: string }) | null;
	}

	async function enableExactSurfaceMode(
		trigger: 'precision' | 'shaken',
	): Promise<void> {
		const session = deps.getSession();
		if (!session) {
			deps.setStatus('Open a project before enabling Exact mode');
			return;
		}
		if (deps.getExactEnableInFlight()) return;
		deps.setExactEnableInFlight(true);

		const precEl = precisionDropdown();
		const weightEl = weightDropdown();

		const revertUi = () => {
			deps.setLocPrecision('estimate');
			if (precEl) deps.syncPrecisionDropdown(precEl, 'estimate');
			if (weightEl) {
				// Keep real axis (not shaken UI value) under estimate
				deps.syncWeightDropdown(weightEl, deps.getWeightAxis());
			}
		};

		try {
			deps.setStatus('Loading JS/TS export-surface engine…');
			const result = await ensureExactForGraph(session.graph, {
				cachedProvider: deps.getSurfaceProvider(),
			});

			if (!result.ok) {
				revertUi();
				deps.openUnavailableModal({
					label: trigger === 'shaken' ? 'Weight' : 'Precision',
					heading: 'Export surface unavailable',
					body:
						result.error +
						' Charts stay on estimate (whole-file / dual-side estimate) weights. Exact is not a language server.',
				});
				deps.setStatus(result.error);
				return;
			}

			deps.setSurfaceProvider(result.provider);
			deps.setLocPrecision('exact');
			// UI “Export surface (Exact)” maps to target-loc + exact precision
			deps.setWeightAxis('target-loc');

			if (precEl) deps.syncPrecisionDropdown(precEl, 'exact');
			if (weightEl) {
				// Prefer export-surface UI value when that was the entry; else keep target-loc
				if (trigger === 'shaken') {
					weightEl.value = 'imported-loc';
					weightEl.setAttribute('value', 'imported-loc');
				} else {
					deps.syncWeightDropdown(weightEl, 'target-loc');
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

			const srcNote =
				result.source === 'jsdelivr' || result.source === 'unpkg'
					? ` · engine ${result.source} (CDN)`
					: result.source === 'local' || result.source === 'inject'
						? ` · engine ${result.source}`
						: result.source === 'cached'
							? ' · engine cached'
							: '';
			deps.remountCurrentView();
			deps.setStatus(`Export-surface Exact on (JS/TS export decls)${srcNote}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			revertUi();
			deps.openUnavailableModal({
				label: trigger === 'shaken' ? 'Weight' : 'Precision',
				heading: 'Export surface failed',
				body: msg + ' Charts stay on estimate weights.',
			});
			deps.setStatus(msg);
		} finally {
			deps.setExactEnableInFlight(false);
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
	 */
	function invalidateExactProvider(): void {
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
	 * Reuses ensureExactForGraph (same pipeline as enableExactSurfaceMode).
	 * Does not auto-change weightAxis (chrome preserve on reindex).
	 */
	async function rehydrateExactForGraph(): Promise<void> {
		const session = deps.getSession();
		if (!session) return;
		if (deps.getExactEnableInFlight()) return;
		deps.setExactEnableInFlight(true);

		const precEl = precisionDropdown();
		const weightEl = weightDropdown();

		const fallBackEstimate = (msg: string) => {
			deps.setLocPrecision('estimate');
			if (precEl) deps.syncPrecisionDropdown(precEl, 'estimate');
			if (weightEl) {
				deps.syncWeightDropdown(weightEl, deps.getWeightAxis());
			}
			deps.remountCurrentView();
			deps.setStatus(msg);
		};

		try {
			deps.setStatus('Rebuilding export-surface Exact for updated graph…');
			const result = await ensureExactForGraph(session.graph, {
				cachedProvider: deps.getSurfaceProvider(),
			});

			if (!result.ok) {
				deps.openUnavailableModal({
					label: 'Precision',
					heading: 'Export surface unavailable',
					body:
						result.error +
						' Charts stay on estimate (whole-file / dual-side estimate) weights. Exact is not a language server.',
				});
				fallBackEstimate(result.error);
				return;
			}

			deps.setSurfaceProvider(result.provider);
			deps.setLocPrecision('exact');
			// weightAxis preserved (reindex chrome contract)

			if (precEl) deps.syncPrecisionDropdown(precEl, 'exact');
			if (weightEl) {
				deps.syncWeightDropdown(weightEl, deps.getWeightAxis());
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

			const srcNote =
				result.source === 'jsdelivr' || result.source === 'unpkg'
					? ` · engine ${result.source} (CDN)`
					: result.source === 'local' || result.source === 'inject'
						? ` · engine ${result.source}`
						: result.source === 'cached'
							? ' · engine cached'
							: '';
			deps.remountCurrentView();
			deps.setStatus(
				`Export-surface Exact on (JS/TS export decls)${srcNote} · reindexed`,
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			deps.openUnavailableModal({
				label: 'Precision',
				heading: 'Export surface failed',
				body: msg + ' Charts stay on estimate weights.',
			});
			fallBackEstimate(msg);
		} finally {
			deps.setExactEnableInFlight(false);
		}
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
