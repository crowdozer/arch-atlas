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
	buildMassBins,
	catalogSpines,
	type AlluvialNodeRef,
	type AlluvialPayload,
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
	sameView,
	statusForView,
	topOfStack,
	viewForFileOpen,
	viewUsesDepth,
	type AtlasView,
	type InteractionMode,
	type Session,
} from '@shell/index.ts';
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
	readPersistPreference,
	savePersistedSession,
} from './sessionStore.ts';
import { wireUi } from './wireUi.ts';

// ── Module state (web host bag) ──────────────────────────────────────────────

let session: Session | null = null;
/**
 * Nested alluvial focus (top of stack = current view).
 * File opens are always file-hub traversal; package/module are drill-only.
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
/** Once per enable: mixed-language warning already shown. */
let exactMixedWarningShown = false;
/**
 * Viz-only dual BFS hop radius for file-hub (does not bound graph scan).
 * Default {@link HUB_DEFAULT_MAX_DEPTH} (3); package/module ignore depth.
 */
let vizMaxDepth = HUB_DEFAULT_MAX_DEPTH;
/** True after the user picks Depth manually (stops auto mode defaults). */
let depthUserSet = false;
/** Click behavior: drill navigates; inspect opens import evidence. */
let interactionMode: InteractionMode = 'drill';
/** Spine ranking formula (session-local; not persisted). */
let spineFormula: SpineFormula = DEFAULT_SPINE_FORMULA;
/**
 * Per-graph export-surface LOC map for mass bins (text spans; rebuilt on graph change).
 * Filled when Exact is on; not a re-index.
 */
let exportSurfaceLocCache: Map<string, number> | null = null;

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

const inspect = createInspectModals({
	getLocPrecision: () => locPrecision,
	getSession: () => session,
	getSurface: () => (locPrecision === 'exact' ? surfaceProvider : null),
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
	if (locPrecision === 'exact' && surfaceProvider) {
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

	const cat: MapCatalog = {
		...base,
		spines,
		spineFormula: formula,
		publicMass,
		icebergs,
	};
	catalog.renderCatalog(cat, fileId);
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
	getExactMixedWarningShown: () => exactMixedWarningShown,
	setExactMixedWarningShown: (v) => {
		exactMixedWarningShown = v;
	},
	remountCurrentView: () => remountCurrentView(),
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
	return canMountWeight(weightAxis, locPrecision, surfaceProvider);
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

function isPersistEnabled(): boolean {
	const el = persistCheckbox();
	if (!el) return readPersistPreference();
	return Boolean(el.checked);
}

/** Write session when the remember checkbox is on; no-op otherwise. */
function persistSessionIfEnabled(): void {
	if (!session || !isPersistEnabled()) return;
	const result = savePersistedSession(session);
	if (!result.ok) setStatus(result.reason);
}

function currentView(): AtlasView | null {
	return topOfStack(viewStack);
}

function payloadForView(view: AtlasView): AlluvialPayload | null {
	if (!session) return null;
	return projectPayloadForView(session.graph, view, {
		weightAxis,
		maxDepth: vizMaxDepth,
		precision: locPrecision,
		surface: locPrecision === 'exact' ? surfaceProvider : null,
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
	if (mounted) setStatus(statusForView(view));
	else if (!payload) setStatus(emptyPayloadStatus(view));

	tree.renderTree();
	paintCatalog(fileId);

	if (!opts?.skipPersist) persistSessionIfEnabled();
	return mounted;
}

/** Root open: replace stack with one view (catalog / tree / restore). */
function navigateReplace(view: AtlasView, opts?: { skipPersist?: boolean }): boolean {
	if (!session) return false;
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
	viewStack.pop();
	const view = currentView();
	if (!view) return false;
	applyDepthDefaultForView(view);
	return commitNavigation(opts);
}

function drillFromRef(ref: AlluvialNodeRef, displayName: string): void {
	if (ref.kind === 'bucket') {
		setStatus(`Can't drill into aggregate “${displayName}”`);
		return;
	}
	if (ref.kind === 'file') {
		navigatePush(viewForFileOpen(ref.id));
		return;
	}
	if (ref.kind === 'package' || ref.kind === 'unresolved') {
		navigatePush({ type: 'package', packageId: ref.id, label: displayName });
		return;
	}
	if (ref.kind === 'module') {
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
	mountAlluvialGated(payloadForView(view));
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
	resetExactState: () => {
		exact.resetExactState();
		exportSurfaceLocCache = null;
		spineFormula = DEFAULT_SPINE_FORMULA;
	},
	tryAutoExactWhenLocalAvailable: () => exact.tryAutoExactWhenLocalAvailable(),
	clearStage: () => stage.clear(),
	renderCatalog: (_cat, startId) => paintCatalog(startId),
	renderTree: () => tree.renderTree(),
	navigateReplace: (view, opts) => navigateReplace(view, opts),
	persistSessionIfEnabled,
	isPersistEnabled,
	setStatus,
	showWarnings,
	updateCaption,
	updateBackButton,
	syncDepthDropdown,
});

tree = createTreeRenderer({
	getSession: () => session,
	selectStart: (path) => lifecycle.selectStart(path),
	persistSessionIfEnabled,
});

catalog = createCatalogRenderer({
	selectStart: (id) => lifecycle.selectStart(id),
	navigatePush: (view) => navigatePush(view),
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
	persistSessionIfEnabled,
	syncWeightDropdown,
	syncPrecisionDropdown,
	syncDepthDropdown,
	syncInteractionModeUi,
	enableExactSurfaceMode: (t) => exact.enableExactSurfaceMode(t),
	disableExactPaintMode: () => exact.disableExactPaintMode(),
	remountCurrentView,
	navigatePop: () => navigatePop(),
	resetSession: () => lifecycle.resetSession(),
	handleZip: (f) => lifecycle.handleZip(f),
	handleDemo: (id) => lifecycle.handleDemo(id),
	renderTree: () => tree.renderTree(),
	closeUnavailableModal: () => inspect.closeUnavailableModal(),
	closeInspectModal: () => inspect.closeInspectModal(),
	updateBackButton,
	tryRestoreSession: () => lifecycle.tryRestoreSession(),
});
