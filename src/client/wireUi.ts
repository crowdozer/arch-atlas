/**
 * Web host control wiring (Carbon listeners + demos + filter + resize).
 * Extracted from the composition root; behavior-preserving. Session bag and
 * navigation stay in `app.ts` — this module only binds DOM events.
 */

import type { BandSortMode, LocPrecision, WeightAxis } from '@core/index.ts';
import {
	isShakenWeightUi,
	parseBandSortMode,
	parseInteractionMode,
	parseLocPrecision,
	parseVizMaxDepth,
	parseWeightAxis,
	type AtlasView,
	type InteractionMode,
	type Session,
} from '@shell/index.ts';
import { $, setStatus } from './dom.ts';
import type { DemoId } from './demoFixtures.ts';
import {
	readPrefsEnabled,
	writePrefsEnabled,
} from './prefsStore.ts';
import {
	listInsightScenes,
	parseSceneQuery,
	type SceneId,
} from './insightScenes.ts';
import {
	clearPersistedSession,
	readPersistPreference,
	writePersistPreference,
} from './sessionStore.ts';

export type WireUiDeps = {
	getSession: () => Session | null;
	getWeightAxis: () => WeightAxis;
	setWeightAxis: (a: WeightAxis) => void;
	getBandSort: () => BandSortMode;
	setBandSort: (m: BandSortMode) => void;
	getLocPrecision: () => LocPrecision;
	getVizMaxDepth: () => number;
	setVizMaxDepth: (d: number) => void;
	setDepthUserSet: (v: boolean) => void;
	/**
	 * Snapshot sticky projection chrome (Depth / Weight / Band order, …)
	 * into localStorage when Remember preferences is on.
	 */
	persistProjectionPrefs: () => void;
	getInteractionMode: () => InteractionMode;
	setInteractionMode: (m: InteractionMode) => void;
	currentView: () => AtlasView | null;
	persistCheckbox: () => (HTMLElement & { checked?: boolean }) | null;
	/** Splash: Remember preferences (projection chrome + engine precision map). */
	enginePrefCheckbox: () => (HTMLElement & { checked?: boolean }) | null;
	includeTestsCheckbox: () => (HTMLElement & { checked?: boolean }) | null;
	getIncludeTests: () => boolean;
	setIncludeTests: (on: boolean) => void;
	/** Re-index session feed under current include-tests preference. */
	reindexWithTestInclusion: () => void;
	persistSessionIfEnabled: () => void;
	syncWeightDropdown: (
		el: HTMLElement & { value?: string },
		axis: WeightAxis,
	) => void;
	syncPrecisionDropdown: (
		el: HTMLElement & { value?: string },
		precision: LocPrecision,
	) => void;
	syncDepthDropdown: () => void;
	syncInteractionModeUi: () => void;
	enableExactSurfaceMode: (trigger: 'precision' | 'shaken') => Promise<void>;
	/** Precision → Program (createProgram worker enrich). */
	enableProgramMode: () => Promise<void>;
	disableExactPaintMode: () => void;
	remountCurrentView: () => void;
	navigatePop: () => boolean;
	resetSession: () => void;
	handleZip: (file: File) => Promise<void>;
	handleDemo: (id: DemoId) => void;
	handleInsightScene: (id: SceneId) => void;
	renderTree: () => void;
	closeUnavailableModal: () => void;
	closeInspectModal: () => void;
	updateBackButton: () => void;
	tryRestoreSession: () => boolean;
	/**
	 * Dev-only alluvial dump (payload + Carbon). No-op if button absent (prod).
	 */
	dumpAlluvialDebug?: () => void | Promise<void>;
};

function wirePersistCheckbox(deps: WireUiDeps): void {
	const box = deps.persistCheckbox();
	if (!box) return;
	box.checked = readPersistPreference();
	// Carbon checkbox fires cds-checkbox-changed (not native change alone)
	box.addEventListener('cds-checkbox-changed', () => {
		const on = Boolean(box.checked);
		writePersistPreference(on);
		if (on) {
			if (deps.getSession()) deps.persistSessionIfEnabled();
		} else {
			clearPersistedSession();
		}
	});
}

function wirePrefsCheckbox(deps: WireUiDeps): void {
	const box = deps.enginePrefCheckbox();
	if (!box) return;
	box.checked = readPrefsEnabled();
	box.addEventListener('cds-checkbox-changed', () => {
		const on = Boolean(box.checked);
		writePrefsEnabled(on);
		// Turning on: snapshot current chrome so reopen matches this session
		if (on) deps.persistProjectionPrefs();
	});
}

function wireIncludeTestsCheckbox(deps: WireUiDeps): void {
	const box = deps.includeTestsCheckbox();
	if (!box) return;
	// Reflect module state (web default: tests off)
	box.checked = deps.getIncludeTests();
	box.addEventListener('cds-checkbox-changed', () => {
		const on = Boolean(box.checked);
		deps.setIncludeTests(on);
		if (deps.getSession()) {
			deps.reindexWithTestInclusion();
		}
	});
}

/** Bind all workspace chrome controls; call once at bootstrap. */
export function wireUi(deps: WireUiDeps): void {
	wirePersistCheckbox(deps);
	wirePrefsCheckbox(deps);
	wireIncludeTestsCheckbox(deps);

	const drop = $('atlas-drop');
	// Carbon file-uploader drop container: click + drag both emit this event
	drop?.addEventListener('cds-file-uploader-drop-container-changed', ((
		e: Event,
	) => {
		const files = (e as CustomEvent<{ addedFiles?: File[] }>).detail?.addedFiles;
		const f = files?.[0];
		if (f) void deps.handleZip(f);
	}) as EventListener);

	$('atlas-reset')?.addEventListener('click', () => {
		deps.resetSession();
	});

	$('atlas-alluvial-back')?.addEventListener('click', () => {
		deps.navigatePop();
	});

	const weightDropdown = $('atlas-weight-axis') as
		| (HTMLElement & { value?: string })
		| null;
	if (weightDropdown) {
		deps.syncWeightDropdown(weightDropdown, deps.getWeightAxis());
		weightDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof weightDropdown.value === 'string' ? weightDropdown.value : '');
			// Shaken → Exact surface mode entry (same engine path as Precision Exact)
			if (isShakenWeightUi(next)) {
				void deps.enableExactSurfaceMode('shaken');
				return;
			}
			deps.setWeightAxis(parseWeightAxis(next));
			// Leaving surface claim while exact: if axis no longer needs surface, keep precision
			// but remount; user can still inspect under exact. If they pick non-target while exact,
			// keep provider cached; paint uses axis estimate path for non-target axes.
			deps.syncWeightDropdown(weightDropdown, deps.getWeightAxis());
			deps.persistProjectionPrefs();
			deps.remountCurrentView();
		}) as EventListener);
	}

	const depthDropdown = $('atlas-max-depth') as
		| (HTMLElement & { value?: string })
		| null;
	if (depthDropdown) {
		deps.syncDepthDropdown();
		depthDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof depthDropdown.value === 'string' ? depthDropdown.value : '');
			deps.setVizMaxDepth(parseVizMaxDepth(next));
			deps.setDepthUserSet(true);
			deps.persistProjectionPrefs();
			deps.remountCurrentView();
		}) as EventListener);
	}

	const bandSortDropdown = $('atlas-band-sort') as
		| (HTMLElement & { value?: string })
		| null;
	if (bandSortDropdown) {
		const syncBandSort = () => {
			const m = deps.getBandSort();
			bandSortDropdown.value = m;
			bandSortDropdown.setAttribute('value', m);
		};
		syncBandSort();
		bandSortDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof bandSortDropdown.value === 'string'
					? bandSortDropdown.value
					: 'name');
			deps.setBandSort(parseBandSortMode(next));
			syncBandSort();
			deps.persistProjectionPrefs();
			deps.remountCurrentView();
		}) as EventListener);
	}

	const precisionDropdown = $('atlas-loc-precision') as
		| (HTMLElement & {
				value?: string;
		  })
		| null;
	if (precisionDropdown) {
		deps.syncPrecisionDropdown(precisionDropdown, deps.getLocPrecision());
		precisionDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof precisionDropdown.value === 'string'
					? precisionDropdown.value
					: 'estimate');
			const parsed = parseLocPrecision(next);
			if (parsed === 'exact') {
				void deps.enableExactSurfaceMode('precision');
				return;
			}
			if (parsed === 'program') {
				void deps.enableProgramMode();
				return;
			}
			// Estimate: leave provider cached; paint estimate mass again
			deps.disableExactPaintMode();
			setStatus('Estimate mode (whole-file imported LOC)');
		}) as EventListener);
	}

	$('atlas-unavailable-close')?.addEventListener('click', () => {
		deps.closeUnavailableModal();
	});

	const modeHost = $('atlas-interaction-mode');
	if (modeHost) {
		deps.syncInteractionModeUi();
		modeHost.addEventListener('click', (e: Event) => {
			const target = (e.target as Element | null)?.closest?.('[data-mode]') as
				| HTMLElement
				| null;
			if (!target || !modeHost.contains(target)) return;
			const next = parseInteractionMode(target.getAttribute('data-mode') ?? 'drill');
			if (next === deps.getInteractionMode()) return;
			deps.setInteractionMode(next);
			deps.syncInteractionModeUi();
			setStatus(
				deps.getInteractionMode() === 'inspect'
					? 'Inspect mode — click for import evidence'
					: 'Drill mode',
			);
		});
	}

	$('atlas-inspect-close')?.addEventListener('click', () => {
		deps.closeInspectModal();
	});

	// Dev-only Dump chart → .atlas-debug/ (button only rendered when import.meta.env.DEV)
	$('atlas-debug-dump')?.addEventListener('click', () => {
		void deps.dumpAlluvialDebug?.();
	});

	$('atlas-demo-react-simple')?.addEventListener('click', () => {
		deps.handleDemo('react-simple');
	});
	$('atlas-demo-next-complex')?.addEventListener('click', () => {
		deps.handleDemo('next-complex');
	});
	$('atlas-demo-spaghetti-godfile')?.addEventListener('click', () => {
		deps.handleDemo('spaghetti-godfile');
	});
	$('atlas-demo-python-app')?.addEventListener('click', () => {
		deps.handleDemo('python-app');
	});

	// Insight scenes: gallery cards + any [data-scene] control
	const loadScene = (id: SceneId) => {
		// Keep URL shareable (Artillery-style)
		const url = new URL(location.href);
		url.searchParams.set('scene', id);
		history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
		deps.handleInsightScene(id);
	};
	for (const scene of listInsightScenes()) {
		$(`atlas-scene-${scene.id}`)?.addEventListener('click', () => {
			loadScene(scene.id);
		});
	}
	document.querySelectorAll<HTMLElement>('[data-scene]').forEach((el) => {
		const id = el.getAttribute('data-scene');
		if (!id || !listInsightScenes().some((s) => s.id === id)) return;
		// Avoid double-bind when id is also atlas-scene-*
		if (el.id === `atlas-scene-${id}`) return;
		el.addEventListener('click', () => loadScene(id as SceneId));
	});

	const treeFilter = $('atlas-tree-filter');
	// Carbon search: cds-search-input; also listen for input if it bubbles
	const onTreeFilter = () => {
		if (!deps.getSession()) return;
		deps.renderTree();
	};
	treeFilter?.addEventListener('cds-search-input', onTreeFilter);
	treeFilter?.addEventListener('input', onTreeFilter);

	// Remount chart on resize so height tracks stage (keep current drill view)
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	window.addEventListener('resize', () => {
		if (!deps.currentView()) return;
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (!deps.currentView()) return;
			deps.remountCurrentView();
		}, 150);
	});

	deps.updateBackButton();
	// Scene query wins over localStorage restore (shareable insight presets)
	const bootScene = parseSceneQuery(location.search);
	if (bootScene) {
		deps.handleInsightScene(bootScene);
	} else {
		deps.tryRestoreSession();
	}
}
