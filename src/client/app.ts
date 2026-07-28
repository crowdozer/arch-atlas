/**
 * Client composition root: ZIP upload → index → catalog / tree / alluvial.
 * Analysis is local-only; optional localStorage remember (upload checkbox).
 *
 * Shell pure helpers: `@shell/*`. Web paint: `dom`, `renderTree`, `renderCatalog`,
 * `inspectModal`. Exact paint: `exactPaintMode`. Session open/restore/reset:
 * `sessionLifecycle`. Control wiring: `wireUi`. Host-shared Exact: `@exact/*`.
 * Alluvial stage: `@stage/*`.
 */
import {
	DEFAULT_SPINE_FORMULA,
	HUB_DEFAULT_MAX_DEPTH,
	buildMapCatalog,
	buildMassBins,
	catalogSpines,
	edgeMatchesPackage,
	type AlluvialNodeRef,
	type AlluvialPayload,
	type BandSortMode,
	type CodeGraph,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type MapCatalog,
	type SpineFormula,
	type WeightAxis,
} from '@core/index.ts';
import {
	canMountWeight,
	captionForView,
	defaultDepthForView,
	emptyPayloadStatus,
	nearestFileFocus,
	parseInteractionMode,
	parseSpineFormula,
	payloadForView as projectPayloadForView,
	precisionForSurfaceClaims,
	sameView,
	statusForView,
	topOfStack,
	viewForFileOpen,
	viewUsesDepth,
	type AtlasView,
	type InteractionMode,
	type Session,
	type SessionProgramMeta,
} from '@shell/index.ts';
import { runAlluvialDebugDump } from './debugDump.ts';
import {
	createAlluvialStage,
	drillTargetFromLine,
	isDrillableRef,
} from '@stage/index.ts';
import {
	collectExportSpansFromText,
	coveredExportLines,
} from '@exact/index.ts';
import { $, setStatus, showWarnings } from './dom.ts';
import { createExactPaintMode } from './exactPaintMode.ts';
import { createInspectModals } from './inspectModal.ts';
import {
	createCatalogRenderer,
	openSpineFormulaHelpModal,
} from './renderCatalog.ts';
import { createTreeRenderer } from './renderTree.ts';
import {
	createSessionLifecycle,
	type SessionLifecycle,
} from './sessionLifecycle.ts';
import {
	readEnginePrefEnabled,
	readEnginePrefs,
	stickyOpenAction,
} from './enginePrefs.ts';
import type { InsightScene } from './insightScenes.ts';
import {
	readPersistPreference,
	savePersistedSession,
} from './sessionStore.ts';
import { cancelProgramEnrichment } from './programWorkerClient.ts';
import { wireUi } from './wireUi.ts';

// ── Module state (web host bag) ──────────────────────────────────────────────

let session: Session | null = null;
/**
 * Nested alluvial focus (top of stack = current view).
 * File opens are always file-hub traversal; module is drill-only.
 * Package / unresolved sinks open package-hub (Export* → External).
 *
 * ## Navigation model
 * `viewStack` is the sole owner of “where we are.” Session `startId` (tree /
 * catalog selection + persist) is **derived** as the nearest file-hub frame on
 * the stack — never updated as a parallel lifecycle. All stack mutations go
 * through {@link navigateReplace} / {@link navigatePush} / {@link navigatePop},
 * which commit chrome via {@link commitNavigation}.
 */
let viewStack: AtlasView[] = [];
/** Band-width axis for all projectors (session-local; not persisted). */
let weightAxis: WeightAxis = 'target-loc';
/** In-column band stack order (session-local; not persisted). */
let bandSort: BandSortMode = 'name';
/**
 * Imported-surface honesty: estimate (Level-1) vs exact (export-surface provider).
 * Exact / export-surface weight entry loads engines and installs {@link surfaceProvider}.
 * Not a language server — classic createSourceFile export spans.
 */
let locPrecision: LocPrecision = 'estimate';
/**
 * Exact surface provider when engines are ready (web: classic TS AST; host inject).
 * Cached across estimate↔exact toggles; not unloaded on Estimate.
 */
let surfaceProvider: ImportedSurfaceProvider | null = null;
/** True while ensureExact is in flight (ignore re-entrant control events). */
let exactEnableInFlight = false;
/**
 * Last Exact/Program enable failed/demoted — language chip fail indication.
 * Cleared on success, user Estimate, or full Exact reset.
 */
let engineFailed = false;
/** Once per enable: mixed-language warning already shown. */
let exactMixedWarningShown = false;
/**
 * Program chrome with live Exact mass (export-surface public mass / icebergs).
 * Set after Program enrich loads Exact; cleared on estimate / new open.
 */
let programExactMass = false;
/**
 * Viz-only hop radius for file-hub (dual BFS) and package-hub (reverse).
 * Does not bound graph scan. Default {@link HUB_DEFAULT_MAX_DEPTH} (3);
 * module ignores depth.
 */
let vizMaxDepth = HUB_DEFAULT_MAX_DEPTH;
/** True after the user picks Depth manually (stops auto mode defaults). */
let depthUserSet = false;
/** Click behavior: drill navigates; inspect opens import evidence. */
let interactionMode: InteractionMode = 'drill';
/**
 * When false, drop test-like paths from the index (`isTestPath`).
 * Default false (web only) — CLI still includes tests unless --omit.
 */
let includeTests = false;
/** Spine ranking formula (session-local; not persisted). */
let spineFormula: SpineFormula = DEFAULT_SPINE_FORMULA;
/**
 * Per-graph export-surface LOC map for mass bins (text spans; rebuilt on graph change).
 * Filled when Exact is on; not a re-index.
 */
let exportSurfaceLocCache: Map<string, number> | null = null;
/**
 * Sticky package open intent: painted External label (pair packageName) after
 * Export Roots / package drill. Not on AtlasView; cleared on ordinary file/module nav.
 * Not persisted.
 */
let pendingPackageFocusLabel: string | null = null;
/**
 * True while {@link openPackageAsHub} is navigating so replace/push do not
 * clear the package intent they just set (selectStart/file nav still clear).
 */
let packageOpenInFlight = false;

// ── Stage (Carbon chart + polish + focus; host injects outcomes) ─────────────

const stage = createAlluvialStage({
	getRoot: () => $('atlas-alluvial'),
	getInteractionMode: () => interactionMode,
	onNodeClick: (name) => handleNodeClick(name),
	onLineClick: (source, target) => handleLineClick(source, target),
});

// ── Paint modules (late-bound; assigned after lifecycle for selectStart) ──────

let tree!: ReturnType<typeof createTreeRenderer>;
let catalog!: ReturnType<typeof createCatalogRenderer>;
let lifecycle!: SessionLifecycle;

/** Exact mass when Precision is exact, or Program after Exact rehydrate. */
function surfaceLiveForMass(): ImportedSurfaceProvider | null {
	if (!surfaceProvider) return null;
	if (locPrecision === 'exact') return surfaceProvider;
	if (locPrecision === 'program' && programExactMass) return surfaceProvider;
	return null;
}

const inspect = createInspectModals({
	/** Chrome precision for honesty headers (Program stays Program). */
	getLocPrecision: () => locPrecision,
	/** Remapped precision for export-surface evidence / callsite copy. */
	getPrecisionForSurfaceClaims: () =>
		precisionForSurfaceClaims(locPrecision, programExactMass),
	getSession: () => session,
	getSurface: () => surfaceLiveForMass(),
	refForName: (name) => stage.refForName(name),
});

// ── Exact paint (injected deps; state bag stays in composition root) ─────────

function syncWeightDropdown(
	el: HTMLElement & { value?: string },
	axis: WeightAxis,
): void {
	el.value = axis;
	el.setAttribute('value', axis);
}

function syncPrecisionDropdown(
	el: HTMLElement & { value?: string },
	precision: LocPrecision,
): void {
	el.value = precision;
	el.setAttribute('value', precision);
}

function exportSurfaceLocMapFromGraph(graph: CodeGraph): Map<string, number> {
	const map = new Map<string, number>();
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const content = graph.contents.get(path);
		if (content === undefined) {
			map.set(path, 0);
			continue;
		}
		map.set(path, coveredExportLines(collectExportSpansFromText(content)));
	}
	return map;
}

/**
 * Paint catalog with optional Exact mass overlay + selected spine formula.
 * Does not mutate session.catalog (index remains estimate topology + empty mass).
 */
function paintCatalog(selectedStart?: string | null): void {
	if (!session) return;
	const fileId =
		selectedStart !== undefined
			? selectedStart
			: nearestFileFocus(viewStack);
	const base = session.catalog;
	const limit = Math.max(base.spines?.length ?? 15, 15);
	const formula = spineFormula;
	const spines =
		formula === (base.spineFormula ?? DEFAULT_SPINE_FORMULA) && base.spines?.length
			? base.spines
			: catalogSpines(session.graph, limit, formula);

	let publicMass = base.publicMass ?? [];
	let icebergs = base.icebergs ?? [];
	const massExactReady = Boolean(surfaceLiveForMass());
	if (massExactReady) {
		if (!exportSurfaceLocCache) {
			exportSurfaceLocCache = exportSurfaceLocMapFromGraph(session.graph);
		}
		const mass = buildMassBins(session.graph, exportSurfaceLocCache, limit);
		publicMass = mass.publicMass;
		icebergs = mass.icebergs;
	} else {
		publicMass = [];
		icebergs = [];
	}

	// Thin L3 badges from Program meta (topology path only)
	let fileLoc = base.fileLoc;
	const pmeta = session.programMeta;
	if (pmeta?.exportSymbolCount?.size) {
		fileLoc = fileLoc.map((row) => {
			const n = pmeta.exportSymbolCount.get(row.path);
			return n === undefined ? row : { ...row, exportSymbolCount: n };
		});
	}

	const cat: MapCatalog = {
		...base,
		spines,
		spineFormula: formula,
		publicMass,
		icebergs,
		fileLoc,
	};
	catalog.renderCatalog(cat, fileId, {
		massExactReady,
		selectedPackage: pendingPackageFocusLabel,
		locPrecision,
		programLoading: exactEnableInFlight && locPrecision === 'program',
		engineFailed,
	});
}

/** Apply sticky package FocusSeed on the current stage focus API (post-mount). */
function applyPendingPackageFocus(): void {
	const label = pendingPackageFocusLabel;
	if (!label) return;
	const api = stage.getFocusApi();
	if (!api) return;
	const seed = { kind: 'package' as const, name: label };
	api.setDefaultSeed(seed);
	api.applySeed(seed, null);
}

/** Drop package open intent (file/module nav, pop, reset). */
function clearPackageFocusIntent(): void {
	pendingPackageFocusLabel = null;
	const api = stage.getFocusApi();
	if (!api) return;
	api.setDefaultSeed(null);
	// Neutralize active plan when not remounting (e.g. sameView no-op file open).
	api.clearFocus();
}

function applyProgramGraph(graph: CodeGraph, meta: SessionProgramMeta): void {
	if (!session) return;
	let cat = buildMapCatalog(graph);
	if (meta.exportSymbolCount.size) {
		cat = {
			...cat,
			fileLoc: cat.fileLoc.map((row) => {
				const n = meta.exportSymbolCount.get(row.path);
				return n === undefined ? row : { ...row, exportSymbolCount: n };
			}),
		};
	}
	session = {
		...session,
		graph,
		catalog: cat,
		programMeta: meta,
	};
	exportSurfaceLocCache = null;
}

function clearProgramMeta(): void {
	if (!session?.programMeta) return;
	const { programMeta: _drop, ...rest } = session;
	session = rest;
}

const exact = createExactPaintMode({
	getSession: () => session,
	getSurfaceProvider: () => surfaceProvider,
	setSurfaceProvider: (p) => {
		surfaceProvider = p;
		// New provider / graph surface — rebuild mass map on next paint
		exportSurfaceLocCache = null;
	},
	getLocPrecision: () => locPrecision,
	setLocPrecision: (p) => {
		locPrecision = p;
	},
	getWeightAxis: () => weightAxis,
	setWeightAxis: (a) => {
		weightAxis = a;
	},
	getExactEnableInFlight: () => exactEnableInFlight,
	setExactEnableInFlight: (v) => {
		exactEnableInFlight = v;
	},
	setEngineFailed: (v) => {
		engineFailed = v;
	},
	getExactMixedWarningShown: () => exactMixedWarningShown,
	setExactMixedWarningShown: (v) => {
		exactMixedWarningShown = v;
	},
	getProgramExactMass: () => programExactMass,
	setProgramExactMass: (v) => {
		programExactMass = v;
	},
	persistSessionIfEnabled: () => persistSessionIfEnabled(),
	applyProgramGraph,
	clearProgramMeta,
	remountCurrentView: () => remountCurrentView(),
	refreshCatalogChrome: () => paintCatalog(),
	showStageLoading: (msg) => {
		stage.showLoading(msg);
	},
	setStatus,
	openUnavailableModal: (opts) => inspect.openUnavailableModal(opts),
	syncPrecisionDropdown,
	syncWeightDropdown,
	currentView: () => currentView(),
});

// ── Host chrome helpers (DOM-coupled, stay with composition root) ────────────

/** Sync Drill|Inspect segmented buttons (aria-pressed + is-active). */
function syncInteractionModeUi(): void {
	const host = $('atlas-interaction-mode');
	if (!host) return;
	const buttons = host.querySelectorAll<HTMLElement>('[data-mode]');
	for (const btn of buttons) {
		const mode = parseInteractionMode(btn.getAttribute('data-mode') ?? 'drill');
		const active = mode === interactionMode;
		btn.classList.toggle('is-active', active);
		btn.setAttribute('aria-pressed', active ? 'true' : 'false');
	}
}

function syncDepthDropdown(): void {
	const el = $('atlas-max-depth') as (HTMLElement & {
		value?: string;
		disabled?: boolean;
	}) | null;
	if (!el) return;
	el.value = String(vizMaxDepth);
	el.setAttribute('value', String(vizMaxDepth));
	const uses = viewUsesDepth(currentView());
	el.disabled = !uses;
	if (uses) {
		el.removeAttribute('disabled');
		el.removeAttribute('aria-disabled');
	} else {
		el.setAttribute('disabled', '');
		el.setAttribute('aria-disabled', 'true');
	}
	const group = el.closest('.atlas-stage__control-group');
	if (group) group.classList.toggle('is-depth-disabled', !uses);
}

/**
 * Apply mode-default depth when the user has not overridden the dropdown.
 * Call when the top-of-stack view type changes.
 */
function applyDepthDefaultForView(view: AtlasView): void {
	if (depthUserSet) return;
	vizMaxDepth = defaultDepthForView(view);
	syncDepthDropdown();
}

/** When exact + target-loc, refuse remount with estimate numbers. */
function gateWeight(): { ok: true } | { ok: false; message: string } {
	// Program uses estimate mass unless Exact was rehydrated (surfaceLiveForMass)
	const precisionForGate = precisionForSurfaceClaims(
		locPrecision,
		programExactMass,
	);
	const surface =
		precisionForGate === 'exact' ? surfaceLiveForMass() : surfaceProvider;
	return canMountWeight(weightAxis, precisionForGate, surface);
}

/** Mount payload only when weight precision allows; never fake exact target-loc. */
function mountAlluvialGated(payload: AlluvialPayload | null): boolean {
	const gate = gateWeight();
	if (!gate.ok) {
		setStatus(gate.message);
		return false;
	}
	stage.mount(payload);
	return true;
}

/** Carbon cds-checkbox host (checked is a property, not a native input). */
function persistCheckbox(): (HTMLElement & { checked?: boolean }) | null {
	return $('atlas-persist') as (HTMLElement & { checked?: boolean }) | null;
}

function enginePrefCheckbox(): (HTMLElement & { checked?: boolean }) | null {
	return $('atlas-engine-pref') as (HTMLElement & { checked?: boolean }) | null;
}

function includeTestsCheckbox(): (HTMLElement & { checked?: boolean }) | null {
	return $('atlas-include-tests') as (HTMLElement & { checked?: boolean }) | null;
}

function isPersistEnabled(): boolean {
	const el = persistCheckbox();
	if (!el) return readPersistPreference();
	return Boolean(el.checked);
}

/** Write session when the remember checkbox is on; no-op otherwise. */
function persistSessionIfEnabled(): void {
	if (!session || !isPersistEnabled()) return;
	const result = savePersistedSession({
		...session,
		locPrecision,
	});
	if (!result.ok) setStatus(result.reason);
}

function currentView(): AtlasView | null {
	return topOfStack(viewStack);
}

function payloadForView(view: AtlasView): AlluvialPayload | null {
	if (!session) return null;
	const surface = surfaceLiveForMass();
	// Program + Exact rehydrate: paint Exact mass; else program → estimate mass
	const precisionForMass = precisionForSurfaceClaims(
		locPrecision,
		programExactMass,
	);
	return projectPayloadForView(session.graph, view, {
		weightAxis,
		maxDepth: vizMaxDepth,
		precision: precisionForMass,
		surface,
		bandSort,
	});
}

function updateBackButton(): void {
	const btn = $('atlas-alluvial-back') as (HTMLElement & { disabled?: boolean }) | null;
	if (!btn) return;
	const deep = viewStack.length > 1;
	btn.classList.toggle('hidden', !deep);
	// cds-button reflects disabled as property + attribute
	btn.disabled = !deep;
	if (deep) btn.removeAttribute('disabled');
	else btn.setAttribute('disabled', '');
}

function updateCaption(view: AtlasView | null): void {
	const caption = $('atlas-alluvial-caption');
	if (caption) {
		caption.textContent = view
			? captionForView(view, vizMaxDepth)
			: 'Select a start to project modules → code.';
	}
	// Soft type label next to “Alluvial projection” (exact AtlasView.type)
	const typeEl = $('atlas-view-type');
	if (typeEl) {
		if (view) {
			typeEl.hidden = false;
			typeEl.textContent = `${view.type} view`;
		} else {
			typeEl.hidden = true;
			typeEl.textContent = '';
		}
	}
}

/**
 * Single chrome commit after stack mutation:
 * 1. Derive session.startId from stack
 * 2. Mount top view
 * 3. Paint tree/catalog selection
 * 4. If package open intent is pending, sticky-seed package FocusPlan
 */
function commitNavigation(opts?: { skipPersist?: boolean }): boolean {
	if (!session) return false;
	const view = currentView();
	if (!view) return false;

	const fileId = nearestFileFocus(viewStack);
	session.startId = fileId;
	if (fileId) lifecycle.expandToPath(fileId);

	updateCaption(view);
	updateBackButton();
	syncDepthDropdown();

	const payload = payloadForView(view);
	const mounted = mountAlluvialGated(payload);
	if (mounted) {
		if (pendingPackageFocusLabel) {
			applyPendingPackageFocus();
			const hubLabel =
				view.type === 'package-hub'
					? view.packageId
					: (fileId ?? (view.type === 'file-hub' ? view.fileId : ''));
			setStatus(`Package · ${pendingPackageFocusLabel} · hub ${hubLabel}`);
		} else {
			setStatus(statusForView(view));
		}
	} else if (!payload) setStatus(emptyPayloadStatus(view));

	tree.renderTree();
	paintCatalog(fileId);

	if (!opts?.skipPersist) persistSessionIfEnabled();
	return mounted;
}

/** Root open: replace stack with one view (catalog / tree / restore). */
function navigateReplace(view: AtlasView, opts?: { skipPersist?: boolean }): boolean {
	if (!session) return false;
	// Ordinary replace (Import Roots / tree / restore) drops package open intent.
	if (!packageOpenInFlight) clearPackageFocusIntent();
	const payload = payloadForView(view);
	if (!payload) {
		setStatus(emptyPayloadStatus(view));
		return false;
	}
	viewStack = [view];
	applyDepthDefaultForView(view);
	return commitNavigation(opts);
}

/** Drill deeper (alluvial click / ends list). */
function navigatePush(view: AtlasView, opts?: { skipPersist?: boolean }): boolean {
	if (!session) return false;
	const top = currentView();
	if (top && sameView(top, view)) return false;

	// Ordinary push (file/module) drops package intent; package open sets inFlight.
	if (!packageOpenInFlight) clearPackageFocusIntent();

	const payload = payloadForView(view);
	if (!payload) {
		setStatus(emptyPayloadStatus(view));
		return false;
	}

	if (top?.type !== view.type) applyDepthDefaultForView(view);
	viewStack.push(view);
	return commitNavigation(opts);
}

/** Back one level; restores file focus from remaining stack. */
function navigatePop(opts?: { skipPersist?: boolean }): boolean {
	if (!session || viewStack.length <= 1) return false;
	// Package intent is not stack-owned; clear on pop (no re-derive from view).
	clearPackageFocusIntent();
	viewStack.pop();
	const view = currentView();
	if (!view) return false;
	applyDepthDefaultForView(view);
	return commitNavigation(opts);
}

/**
 * Package / unresolved sink → package-hub (Export* → External).
 * Catalog Export Roots use replace (like Import Roots); alluvial drill uses push.
 * Sticky package FocusSeed + Export Roots chrome via pendingPackageFocusLabel
 * (hover restore; geometry already includes all kept importers).
 * sameView keys on packageId.
 */
/**
 * Land an insight scene on its defect view after index + default start open.
 * Sets weight/depth first so projectors match the triage fixture recipe.
 */
function applyInsightSceneOpen(scene: InsightScene): void {
	if (!session) return;
	const open = scene.open;
	if (open.weightAxis) {
		weightAxis = open.weightAxis;
		const weightEl = $('atlas-weight-axis') as
			| (HTMLElement & { value?: string })
			| null;
		if (weightEl) syncWeightDropdown(weightEl, weightAxis);
	}

	if (open.kind === 'file-hub') {
		if (open.maxDepth != null) {
			depthUserSet = true;
			vizMaxDepth = Math.max(1, Math.floor(open.maxDepth));
			syncDepthDropdown();
		}
		navigateReplace(
			{ type: 'file-hub', fileId: open.fileId },
			{ skipPersist: true },
		);
	} else if (open.kind === 'module') {
		navigateReplace(
			{ type: 'module', moduleId: open.moduleId },
			{ skipPersist: true },
		);
	} else {
		// package-hub-via-file: file hub first (for painted label), then package open
		if (open.maxDepth != null) {
			depthUserSet = true;
			vizMaxDepth = Math.max(1, Math.floor(open.maxDepth));
			syncDepthDropdown();
		}
		navigateReplace(
			{ type: 'file-hub', fileId: open.fileId },
			{ skipPersist: true },
		);
		const hubPayload = payloadForView({
			type: 'file-hub',
			fileId: open.fileId,
		});
		const nodeRef = hubPayload?.meta.nodeRef;
		let painted =
			nodeRef &&
			Object.entries(nodeRef).find(
				([, ref]) =>
					(ref.kind === 'package' || ref.kind === 'unresolved') &&
					ref.id === open.packageId,
			)?.[0];
		if (!painted) {
			// Fallback: any package node whose id/label matches
			painted =
				(nodeRef &&
					Object.entries(nodeRef).find(
						([name, ref]) =>
							ref.kind === 'package' &&
							(ref.id === open.packageId || name === open.packageId),
					)?.[0]) ??
				open.packageId;
		}
		openPackageAsHub(open.packageId, painted, 'push');
	}

	setStatus(
		`Scene ${scene.id} · triage ${scene.triagePacket} · ${scene.lookFor}`,
	);
}

function openPackageAsHub(
	packageId: string,
	label: string,
	mode: 'push' | 'replace' = 'push',
): void {
	if (!session) return;
	const hasImporters = session.graph.edges.some((e) =>
		edgeMatchesPackage(e, packageId),
	);
	if (!hasImporters) {
		setStatus(`No importers for ${label}`);
		return;
	}
	// Display label matches pair packageName / External chip (not unresolved: id).
	pendingPackageFocusLabel = label;
	const view: AtlasView = { type: 'package-hub', packageId };
	packageOpenInFlight = true;
	let navigated = false;
	try {
		navigated =
			mode === 'replace' ? navigateReplace(view) : navigatePush(view);
	} finally {
		packageOpenInFlight = false;
	}
	// Push sameView early-return skips commit — still update sticky package seed.
	if (!navigated && pendingPackageFocusLabel) {
		applyPendingPackageFocus();
		setStatus(`Package · ${label} · hub ${packageId}`);
		tree.renderTree();
		paintCatalog(nearestFileFocus(viewStack));
	}
}

function drillFromRef(ref: AlluvialNodeRef, displayName: string): void {
	if (ref.kind === 'bucket') {
		setStatus(`Can't drill into aggregate “${displayName}”`);
		return;
	}
	if (ref.kind === 'file') {
		clearPackageFocusIntent();
		navigatePush(viewForFileOpen(ref.id));
		return;
	}
	if (ref.kind === 'package' || ref.kind === 'unresolved') {
		openPackageAsHub(ref.id, displayName);
		return;
	}
	if (ref.kind === 'module') {
		clearPackageFocusIntent();
		navigatePush({ type: 'module', moduleId: ref.id });
	}
}

function handleNodeClick(name: string): void {
	const ref = stage.refForName(name);
	if (!ref) {
		setStatus(
			interactionMode === 'inspect'
				? `No inspect target for “${name}”`
				: `No drill target for “${name}”`,
		);
		return;
	}
	if (interactionMode === 'inspect') {
		inspect.inspectNode(name, ref);
		return;
	}
	if (!isDrillableRef(ref)) {
		setStatus(`Can't drill into aggregate “${name}”`);
		return;
	}
	drillFromRef(ref, name);
}

/**
 * Line click: prefer file target, else package source, else module source, else package target.
 * Inspect mode opens import-line evidence instead of navigating.
 * Priority is owned by {@link drillTargetFromLine} (shared with hover cyan).
 */
function handleLineClick(sourceName: string | null, targetName: string | null): void {
	if (interactionMode === 'inspect') {
		inspect.inspectBand(sourceName, targetName);
		return;
	}

	const drillName = drillTargetFromLine(
		sourceName,
		targetName,
		interactionMode,
		(n) => stage.refForName(n),
	);
	if (drillName) {
		const ref = stage.refForName(drillName);
		if (ref) drillFromRef(ref, drillName);
		return;
	}

	const sourceRef = sourceName ? stage.refForName(sourceName) : null;
	const targetRef = targetName ? stage.refForName(targetName) : null;
	if (sourceRef?.kind === 'bucket' || targetRef?.kind === 'bucket') {
		setStatus("Can't drill into aggregate band");
		return;
	}
	setStatus('No drill target for this band');
}

/** Remount chart for the top of the view stack (e.g. resize). Also re-paints catalog (Exact mass). */
function remountCurrentView(): void {
	const view = currentView();
	if (!view || !session) return;
	const mounted = mountAlluvialGated(payloadForView(view));
	// New focus API starts defaultSeed=null — re-apply sticky package if still pending.
	if (mounted && pendingPackageFocusLabel) applyPendingPackageFocus();
	paintCatalog();
}

// ── Session lifecycle (zip / demo / open / restore / reset) ──────────────────

lifecycle = createSessionLifecycle({
	getSession: () => session,
	setSession: (s) => {
		session = s;
	},
	setViewStack: (stack) => {
		viewStack = stack;
	},
	setDepthUserSet: (v) => {
		depthUserSet = v;
	},
	setVizMaxDepth: (d) => {
		vizMaxDepth = d;
	},
	getLocPrecision: () => locPrecision,
	cancelProgramEnrichment: () => cancelProgramEnrichment(),
	getProgramExactMass: () => programExactMass,
	enableProgramMode: (opts) => exact.enableProgramMode(opts),
	resetExactState: () => {
		exact.resetExactState();
		exportSurfaceLocCache = null;
		programExactMass = false;
		// engineFailed cleared inside exact.resetExactState via setEngineFailed
		// New open/reset: spine formula is session chrome for a fresh project
		spineFormula = DEFAULT_SPINE_FORMULA;
	},
	invalidateExactProvider: () => {
		// Provider null → setSurfaceProvider clears exportSurfaceLocCache
		exact.invalidateExactProvider();
		programExactMass = false;
		// Do **not** reset spineFormula / weightAxis / locPrecision (reindex preserve)
	},
	rehydrateExactForGraph: () => exact.rehydrateExactForGraph(),
	syncExactChrome: () => exact.syncExactChrome(),
	tryAutoExactWhenLocalAvailable: () => exact.tryAutoExactWhenLocalAvailable(),
	applyStickyEnginePref: async () => {
		const s = session;
		if (!s) return 'none';
		const action = stickyOpenAction(
			s.graph,
			readEnginePrefs(),
			readEnginePrefEnabled(),
		);
		if (action === 'program') {
			await exact.enableProgramMode();
			// Soft-fail demotes chrome — don't claim applied / block auto-local
			return locPrecision === 'program' ? 'applied' : 'none';
		}
		if (action === 'exact') {
			await exact.enableExactSurfaceMode('precision');
			return locPrecision === 'exact' ? 'applied' : 'none';
		}
		if (action === 'stay-estimate') return 'stay-estimate';
		return 'none';
	},
	clearStage: () => {
		clearPackageFocusIntent();
		stage.clear();
	},
	renderCatalog: (_cat, startId) => paintCatalog(startId),
	renderTree: () => tree.renderTree(),
	navigateReplace: (view, opts) => navigateReplace(view, opts),
	persistSessionIfEnabled,
	isPersistEnabled,
	getIncludeTests: () => includeTests,
	setStatus,
	showWarnings,
	updateCaption,
	updateBackButton,
	syncDepthDropdown,
	applyInsightSceneOpen,
});

tree = createTreeRenderer({
	getSession: () => session,
	selectStart: (path) => {
		clearPackageFocusIntent();
		lifecycle.selectStart(path);
	},
	persistSessionIfEnabled,
});

catalog = createCatalogRenderer({
	selectStart: (id) => {
		clearPackageFocusIntent();
		lifecycle.selectStart(id);
	},
	openPackage: (packageId, label) =>
		openPackageAsHub(packageId, label, 'replace'),
	getSpineFormula: () => spineFormula,
	onSpineFormulaChange: (raw) => {
		spineFormula = parseSpineFormula(raw);
		paintCatalog();
	},
	onSpineFormulaInfo: () => openSpineFormulaHelpModal(spineFormula),
});

// ── Bootstrap: bind chrome once ──────────────────────────────────────────────

wireUi({
	getSession: () => session,
	getWeightAxis: () => weightAxis,
	setWeightAxis: (a) => {
		weightAxis = a;
	},
	getBandSort: () => bandSort,
	setBandSort: (m) => {
		bandSort = m;
	},
	getLocPrecision: () => locPrecision,
	getVizMaxDepth: () => vizMaxDepth,
	setVizMaxDepth: (d) => {
		vizMaxDepth = d;
	},
	setDepthUserSet: (v) => {
		depthUserSet = v;
	},
	getInteractionMode: () => interactionMode,
	setInteractionMode: (m) => {
		interactionMode = m;
	},
	currentView: () => currentView(),
	persistCheckbox,
	enginePrefCheckbox,
	includeTestsCheckbox,
	getIncludeTests: () => includeTests,
	setIncludeTests: (on) => {
		includeTests = on;
	},
	reindexWithTestInclusion: () => lifecycle.reindexWithTestInclusion(),
	persistSessionIfEnabled,
	syncWeightDropdown,
	syncPrecisionDropdown,
	syncDepthDropdown,
	syncInteractionModeUi,
	enableExactSurfaceMode: (t) => exact.enableExactSurfaceMode(t),
	enableProgramMode: () => exact.enableProgramMode(),
	disableExactPaintMode: () => exact.disableExactPaintMode(),
	remountCurrentView,
	navigatePop: () => navigatePop(),
	resetSession: () => lifecycle.resetSession(),
	handleZip: (f) => lifecycle.handleZip(f),
	handleDemo: (id) => lifecycle.handleDemo(id),
	handleInsightScene: (id) => lifecycle.handleInsightScene(id),
	renderTree: () => tree.renderTree(),
	closeUnavailableModal: () => inspect.closeUnavailableModal(),
	closeInspectModal: () => inspect.closeInspectModal(),
	updateBackButton,
	tryRestoreSession: () => lifecycle.tryRestoreSession(),
	dumpAlluvialDebug: () =>
		runAlluvialDebugDump({
			payload: stage.getPayload(),
			holder: stage.getHolder(),
			host: {
				viewStack: [...viewStack],
				currentView: currentView(),
				weightAxis,
				bandSort,
				locPrecision,
				vizMaxDepth,
				interactionMode,
				includeTests,
				pendingPackageFocusLabel,
				programExactMass,
				engineFailed,
			},
		}),
});
