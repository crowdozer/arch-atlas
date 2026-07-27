/**
 * Client composition root: ZIP upload → index → catalog / tree / alluvial.
 * Analysis is local-only; optional localStorage remember (upload checkbox).
 *
 * Shell pure helpers: `@shell/*`. Web paint: `dom`, `renderTree`, `renderCatalog`,
 * `inspectModal`. Exact paint orchestration: `exactPaintMode`. Control wiring:
 * `wireUi`. Host-shared Exact engines: `@exact/*`. Alluvial stage: `@stage/*`.
 */
import {
	HUB_DEFAULT_MAX_DEPTH,
	expandPathsForFilter,
	indexFiles,
	ingestZip,
	type AlluvialNodeRef,
	type AlluvialPayload,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type VirtualFile,
	type WeightAxis,
} from '@core/index.ts';
import {
	canMountWeight,
	captionForView,
	defaultDepthForView,
	emptyPayloadStatus,
	nearestFileFocus,
	parseInteractionMode,
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
import { $, setStatus, showWarnings } from './dom.ts';
import { type DemoId, loadDemoFiles } from './demoFixtures.ts';
import { createExactPaintMode } from './exactPaintMode.ts';
import { createInspectModals } from './inspectModal.ts';
import { createCatalogRenderer } from './renderCatalog.ts';
import { createTreeRenderer } from './renderTree.ts';
import {
	clearPersistedSession,
	loadPersistedSession,
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

// ── Stage (Carbon chart + polish + focus; host injects outcomes) ─────────────

const stage = createAlluvialStage({
	getRoot: () => $('atlas-alluvial'),
	getInteractionMode: () => interactionMode,
	onNodeClick: (name) => handleNodeClick(name),
	onLineClick: (source, target) => handleLineClick(source, target),
});

// ── Paint modules (injected deps; one-way ← app) ─────────────────────────────

const inspect = createInspectModals({
	getLocPrecision: () => locPrecision,
	getSession: () => session,
	getSurface: () => (locPrecision === 'exact' ? surfaceProvider : null),
	refForName: (name) => stage.refForName(name),
});

const tree = createTreeRenderer({
	getSession: () => session,
	selectStart,
	persistSessionIfEnabled,
});

const catalog = createCatalogRenderer({
	selectStart,
	navigatePush,
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

const exact = createExactPaintMode({
	getSession: () => session,
	getSurfaceProvider: () => surfaceProvider,
	setSurfaceProvider: (p) => {
		surfaceProvider = p;
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
	if (fileId) expandToPath(fileId);

	updateCaption(view);
	updateBackButton();
	syncDepthDropdown();

	const payload = payloadForView(view);
	const mounted = mountAlluvialGated(payload);
	if (mounted) setStatus(statusForView(view));
	else if (!payload) setStatus(emptyPayloadStatus(view));

	tree.renderTree();
	catalog.renderCatalog(session.catalog, fileId);

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

/** Remount chart for the top of the view stack (e.g. resize). */
function remountCurrentView(): void {
	const view = currentView();
	if (!view || !session) return;
	mountAlluvialGated(payloadForView(view));
}

function showWorkspaceShell(): void {
	$('atlas-upload')?.classList.add('hidden');
	// CSS: .atlas-workspace is display:flex; .atlas-workspace.hidden is none
	$('atlas-workspace')?.classList.remove('hidden');
	$('atlas-subbar')?.classList.remove('hidden');
	$('atlas-subbar')?.classList.add('flex');
}

function activateSession(
	next: Session,
	statusLine: string,
	opts?: { skipPersist?: boolean },
): void {
	// New graph → rebuild Exact provider on next enable (contents snapshot)
	exact.resetExactState();
	session = next;
	showWarnings(session.warnings);
	showWorkspaceShell();
	catalog.renderCatalog(session.catalog, session.startId);
	if (session.startId) selectStart(session.startId, { skipPersist: true });
	else {
		tree.renderTree();
		setStatus(statusLine);
	}
	setStatus(statusLine);
	if (!opts?.skipPersist) persistSessionIfEnabled();
	// Prefer Exact when local classic TS / host inject is already available (no CDN)
	void exact.tryAutoExactWhenLocalAvailable();
}

function expandToPath(startId: string): void {
	if (!session) return;
	const parts = startId.split('/');
	for (let i = 1; i < parts.length; i++) {
		session.expanded.add(parts.slice(0, i).join('/'));
	}
}

/** Catalog / tree / restore: replace stack with file-hub at startId. */
function selectStart(startId: string, opts?: { skipPersist?: boolean }) {
	if (!session) return;
	navigateReplace(viewForFileOpen(startId), opts);
}

function openFromFiles(
	files: VirtualFile[],
	opts?: { warnings?: string[]; statusPrefix?: string },
): void {
	if (!files.length) {
		setStatus('No readable text files.');
		return;
	}
	setStatus(`Indexing ${files.length} files…`);
	const { graph, catalog: cat } = indexFiles(files);
	const paths = [...graph.files.keys()];
	const prefix = opts?.statusPrefix ?? 'Indexed';
	activateSession(
		{
			graph,
			catalog: cat,
			startId: cat.starts[0]?.id ?? null,
			warnings: opts?.warnings ?? [],
			expanded: expandPathsForFilter(paths, ''),
		},
		`${prefix} ${graph.stats.parseableCount ?? graph.stats.sourceCount} parseable · ${graph.stats.unparseableCount ?? 0} unparseable · ${graph.stats.edgeCount} edges`,
	);
}

async function handleZip(file: File) {
	setStatus(`Reading ${file.name}…`);
	showWarnings([]);
	try {
		const buf = await file.arrayBuffer();
		setStatus('Unpacking ZIP…');
		const { files, skipped, warnings } = ingestZip(buf);
		openFromFiles(files, {
			warnings: [
				...warnings,
				skipped ? `Skipped ${skipped} ignored/binary paths.` : '',
			].filter(Boolean),
		});
	} catch (err) {
		console.error(err);
		setStatus(err instanceof Error ? err.message : String(err));
	}
}

function handleDemo(id: DemoId) {
	showWarnings([]);
	try {
		setStatus(`Loading demo “${id}”…`);
		const files = loadDemoFiles(id);
		openFromFiles(files, {
			statusPrefix: `Demo ${id} ·`,
			warnings: [`Loaded built-in demo: ${id}`],
		});
	} catch (err) {
		console.error(err);
		setStatus(err instanceof Error ? err.message : String(err));
	}
}

function tryRestoreSession(): boolean {
	if (!isPersistEnabled()) return false;
	const stored = loadPersistedSession();
	if (!stored) return false;
	try {
		setStatus('Restoring remembered project…');
		const { graph, catalog: cat } = indexFiles(stored.files);
		const startId =
			stored.startId && graph.files.has(stored.startId)
				? stored.startId
				: (cat.starts[0]?.id ?? null);
		const expanded = new Set(stored.expanded);
		// Ensure tree has something open if nothing was stored
		if (!expanded.size) {
			for (const p of expandPathsForFilter([...graph.files.keys()], '')) {
				expanded.add(p);
			}
		}
		activateSession(
			{
				graph,
				catalog: cat,
				startId,
				warnings: stored.warnings,
				expanded,
			},
			`Restored ${graph.stats.sourceCount} sources · ${graph.stats.edgeCount} edges (localStorage)`,
			{ skipPersist: true },
		);
		return true;
	} catch (err) {
		console.error('[atlas] restore failed', err);
		clearPersistedSession();
		setStatus('Could not restore remembered project — upload again.');
		return false;
	}
}

function resetSession() {
	session = null;
	viewStack = [];
	// Fresh session gets hub depth default again
	depthUserSet = false;
	vizMaxDepth = HUB_DEFAULT_MAX_DEPTH;
	exact.resetExactState();
	clearPersistedSession();
	stage.clear();
	updateCaption(null);
	updateBackButton();
	syncDepthDropdown();

	$('atlas-workspace')?.classList.add('hidden');
	$('atlas-subbar')?.classList.add('hidden');
	$('atlas-subbar')?.classList.remove('flex');
	$('atlas-upload')?.classList.remove('hidden');
	setStatus('');
	const uploadStatus = $('atlas-upload-status');
	if (uploadStatus) uploadStatus.textContent = '';
	showWarnings([]);
}

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
	resetSession,
	handleZip,
	handleDemo,
	renderTree: () => tree.renderTree(),
	closeUnavailableModal: () => inspect.closeUnavailableModal(),
	closeInspectModal: () => inspect.closeInspectModal(),
	updateBackButton,
	tryRestoreSession,
});
