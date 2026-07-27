/**
 * Exact paint orchestration (web host).
 *
 * Extracted from the composition root: enable / disable / auto-local / reset.
 * Injected deps keep module state ownership in `app.ts` (no session framework).
 * Engine load lives in host-shared `@exact` — this module is web paint/chrome only.
 * Program (createProgram) topology enrich is async via Web Worker (P4).
 */

import {
	graphNeedsTypescript,
	type CodeGraph,
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
	type SessionProgramMeta,
} from '@shell/index.ts';
import { $ } from './dom.ts';
import { recordPrecisionPreference } from './enginePrefs.ts';
import {
	cancelProgramEnrichment,
	runProgramEnrichment,
} from './programWorkerClient.ts';

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
	/**
	 * Language-chip fail indication (Exact/Program enable demotion).
	 * Cleared on success / full reset / user Estimate.
	 */
	setEngineFailed: (v: boolean) => void;
	getExactMixedWarningShown: () => boolean;
	setExactMixedWarningShown: (v: boolean) => void;
	/**
	 * When Program was entered from Exact: true so mass can rehydrate Exact
	 * after graph swap while precision chrome stays `program`.
	 */
	getProgramExactMass: () => boolean;
	setProgramExactMass: (v: boolean) => void;
	/**
	 * Apply enriched graph + catalog rebuild + programMeta (host owns session).
	 */
	applyProgramGraph: (graph: CodeGraph, meta: SessionProgramMeta) => void;
	/** Drop session.programMeta (soft-fail / new graph without applied Program). */
	clearProgramMeta: () => void;
	remountCurrentView: () => void;
	/**
	 * Re-paint catalog / language chips without remounting the alluvial
	 * (e.g. Program entered flight → incomplete glyph before enrich settles).
	 */
	refreshCatalogChrome?: () => void;
	/**
	 * Clear the alluvial and show a stage loading status while Program enrich
	 * runs (avoids stale prior chart). Wired to {@link AlluvialStage.showLoading}.
	 */
	showStageLoading: (msg: string) => void;
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

/** Options for {@link ExactPaintMode.enableProgramMode}. */
export type EnableProgramModeOpts = {
	/**
	 * Rehydrate Exact mass after successful Program enrich even when chrome is
	 * already `program` (include-tests reindex re-run; prior programExactMass).
	 */
	preferExactMass?: boolean;
};

export type ExactPaintMode = {
	enableExactSurfaceMode: (trigger: 'precision' | 'shaken') => Promise<void>;
	/** Opt-in Program (createProgram) topology enrich via Web Worker. */
	enableProgramMode: (opts?: EnableProgramModeOpts) => Promise<void>;
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

/** Evidence-gated Program status line (not LSP; L2/L3 only when earned). */
export function programStatusHonesty(meta: {
	resolvedCount: number;
	resolvedAliasCount: number;
	thinL3: boolean;
	tsconfig: string;
	missingLibs: string[];
}): string {
	const bits: string[] = [
		`Program: resolved ${meta.resolvedCount} edge${meta.resolvedCount === 1 ? '' : 's'}`,
	];
	if (meta.resolvedAliasCount > 0) {
		bits[0] += ` (alias ${meta.resolvedAliasCount})`;
	}
	if (meta.resolvedCount > 0) {
		bits.push('L2 re-resolve');
	}
	if (meta.thinL3) {
		bits.push('thin L3 exportSymbolCount');
	}
	bits.push('not LSP');
	bits.push('skipDefaultLib');
	if (meta.tsconfig && meta.tsconfig !== 'full') {
		bits.push(`tsconfig ${meta.tsconfig}`);
	}
	return bits.join(' · ');
}

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
		deps.setEngineFailed(true);
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
	 * Settled remount: drop exclusive-flight **before** paint so language chips
	 * do not stick on Program "Loading…" (programLoading uses flight flag).
	 */
	function remountSettled(): void {
		deps.setExactEnableInFlight(false);
		deps.remountCurrentView();
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
		deps.setEngineFailed(false);

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
		// Sticky Exact for open/demo/restore (skip reindex rehydrate — chrome already sticky)
		if (opts.weight === 'force-target-loc') {
			const sess = deps.getSession();
			if (sess) recordPrecisionPreference(sess.graph, 'exact');
		}
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

	/** Leave Exact / Program paint mode (keep Exact provider cached for re-entry). */
	function disableExactPaintMode(): void {
		cancelProgramEnrichment();
		deps.setLocPrecision('estimate');
		deps.setProgramExactMass(false);
		// User demotion is not an engine fail
		deps.setEngineFailed(false);
		const sess = deps.getSession();
		if (sess) recordPrecisionPreference(sess.graph, 'estimate');
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
			deps.setEngineFailed(false);
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
		// Cancel in-flight Program worker (new ZIP/demo/session)
		cancelProgramEnrichment();
		deps.setSurfaceProvider(null);
		deps.setLocPrecision('estimate');
		deps.setProgramExactMass(false);
		deps.setEngineFailed(false);
		deps.setExactMixedWarningShown(false);
		deps.setExactEnableInFlight(false);
		const precEl = precisionDropdown();
		if (precEl) deps.syncPrecisionDropdown(precEl, 'estimate');
	}

	/**
	 * Soft-fail honesty: restore chrome to prior non-program tier so Precision
	 * does not claim createProgram topology when enrich never applied.
	 * Prior `program` (re-run) → estimate.
	 */
	function restorePrecisionAfterProgramFail(prior: LocPrecision): void {
		const restore: LocPrecision = prior === 'exact' ? 'exact' : 'estimate';
		deps.setLocPrecision(restore);
		deps.setProgramExactMass(false);
		deps.clearProgramMeta();
		const precEl = precisionDropdown();
		if (precEl) deps.syncPrecisionDropdown(precEl, restore);
	}

	/**
	 * Precision → Program: async createProgram enrich in a Web Worker.
	 * Soft-fail keeps prior graph + restores prior precision chrome. Topology
	 * only; Exact mass rehydrates when user was Exact (or preferExactMass).
	 */
	async function enableProgramMode(
		opts: EnableProgramModeOpts = {},
	): Promise<void> {
		const session = deps.getSession();
		if (!session) {
			deps.setStatus('Open a project before enabling Program mode');
			return;
		}
		if (deps.getExactEnableInFlight()) return;

		const priorPrecision = deps.getLocPrecision();
		const wasExactMass =
			(priorPrecision === 'exact' && Boolean(deps.getSurfaceProvider())) ||
			Boolean(opts.preferExactMass) ||
			(priorPrecision === 'program' && deps.getProgramExactMass());
		const precEl = precisionDropdown();

		deps.setExactEnableInFlight(true);
		deps.setLocPrecision('program');
		if (precEl) deps.syncPrecisionDropdown(precEl, 'program');
		deps.setStatus('Program: loading TypeScript engine in worker…');
		// Clear prior alluvial immediately — do not leave stale chart during enrich.
		deps.showStageLoading('Building Program topology…');
		// Language chips: incomplete glyph while flight is true (no full remount).
		deps.refreshCatalogChrome?.();

		try {
			const result = await runProgramEnrichment(session.graph, {
				skipDefaultLib: true,
				onProgress: (phase) => {
					if (phase === 'loading-ts') {
						deps.setStatus('Program: loading TypeScript engine…');
					} else if (phase === 'create-program') {
						deps.setStatus('Program: createProgram (feed VFS)…');
					} else if (phase === 'enrich') {
						deps.setStatus('Program: re-resolving unresolved edges…');
					}
				},
			});

			if (result.ok === false) {
				if (result.cancelled) {
					// Supersede / cancel: remount prior graph if session still open so
					// the user is not stuck on the loading placeholder. New open clears
					// session then remounts on its own path — skip if session gone.
					if (deps.getSession()) {
						remountSettled();
					}
					return;
				}
				// Soft-fail: prior graph unchanged; restore prior precision chrome
				restorePrecisionAfterProgramFail(priorPrecision);
				// Fail chip only when demoted to Estimate (restored Exact still honest Exact)
				deps.setEngineFailed(deps.getLocPrecision() === 'estimate');
				deps.setStatus(
					`Program unavailable — ${result.error} · graph left at L1 (not LSP)`,
				);
				remountSettled();
				return;
			}

			const meta: SessionProgramMeta = {
				resolvedCount: result.stats.resolvedCount,
				resolvedAliasCount: result.stats.resolvedAliasCount,
				thinL3: result.thinL3,
				exportSymbolCount: result.exportSymbolCount,
				tsconfig: result.stats.tsconfig,
				missingLibs: [...result.stats.missingLibs],
				rootFileCount: result.stats.rootFileCount,
			};
			deps.applyProgramGraph(result.graph, meta);
			// Sticky Program after successful enrich (topology applied)
			recordPrecisionPreference(result.graph, 'program');
			deps.setEngineFailed(false);

			// Product: if was Exact (or reindex preferExactMass), rehydrate Exact mass
			if (wasExactMass) {
				deps.setStatus(
					'Program topology applied · rebuilding export-surface Exact…',
				);
				const exactResult = await ensureExactForGraph(result.graph, {
					cachedProvider: null,
				});
				if (exactResult.ok) {
					deps.setSurfaceProvider(exactResult.provider);
					deps.setProgramExactMass(true);
					// Flight clear before remount so chips paint lifecycle stable, not Loading
					remountSettled();
					deps.setStatus(
						`${programStatusHonesty(meta)} · Exact mass rehydrated`,
					);
				} else {
					deps.setProgramExactMass(false);
					remountSettled();
					deps.setStatus(
						`${programStatusHonesty(meta)} · Exact mass unavailable (${exactResult.error}) · estimate mass`,
					);
				}
			} else {
				deps.setProgramExactMass(false);
				remountSettled();
				deps.setStatus(programStatusHonesty(meta));
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			restorePrecisionAfterProgramFail(priorPrecision);
			deps.setEngineFailed(deps.getLocPrecision() === 'estimate');
			deps.setStatus(
				`Program failed soft: ${msg} · graph left at L1 (not LSP)`,
			);
			remountSettled();
		} finally {
			// Safety net if a path returned without remountSettled
			deps.setExactEnableInFlight(false);
		}
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
		enableProgramMode,
		disableExactPaintMode,
		tryAutoExactWhenLocalAvailable,
		resetExactState,
		invalidateExactProvider,
		rehydrateExactForGraph,
		syncExactChrome,
	};
}
