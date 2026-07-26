/**
 * Client controller: ZIP upload → index → catalog / tree / alluvial.
 * Analysis is local-only; optional localStorage remember (upload checkbox).
 */
import { AlluvialChart } from '@carbon/charts';
import '@carbon/charts/styles.css';
import {
	EXACT_NOT_IMPLEMENTED_MESSAGE,
	HUB_DEFAULT_MAX_DEPTH,
	edgesForBand,
	edgesForNode,
	evidenceForEdges,
	indexFiles,
	ingestZip,
	projectFileHub,
	projectModuleFocus,
	projectPackageImporters,
	resolveWeightRequest,
	type AlluvialNodeRef,
	type AlluvialPayload,
	type CodeGraph,
	type ImportEvidence,
	type LocPrecision,
	type MapCatalog,
	type VirtualFile,
	type WeightAxis,
} from '@core/index.ts';
import {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
import { polishAlluvialHolder } from './alluvialTopPack.ts';
import { type DemoId, loadDemoFiles } from './demoFixtures.ts';
import {
	clearPersistedSession,
	loadPersistedSession,
	readPersistPreference,
	savePersistedSession,
	writePersistPreference,
} from './sessionStore.ts';
import { treeIconSvg } from './treeIcons.ts';

type Session = {
	graph: CodeGraph;
	catalog: MapCatalog;
	startId: string | null;
	warnings: string[];
	/** Dir paths currently expanded in the tree. */
	expanded: Set<string>;
};

/**
 * Nested alluvial focus (top of stack = current view).
 * File opens are always file-hub traversal; package/module are drill-only.
 */
type AtlasView =
	/** Dual hub: importers → file → exporters (sole file projector). */
	| { type: 'file-hub'; fileId: string }
	| { type: 'package'; packageId: string; label: string }
	| { type: 'module'; moduleId: string };

let session: Session | null = null;
let chart: InstanceType<typeof AlluvialChart> | null = null;
/** Drill-down stack; not persisted in v1. */
let viewStack: AtlasView[] = [];
/** Last mounted payload (for click resolution). */
let currentPayload: AlluvialPayload | null = null;
/** Band-width axis for all projectors (session-local; not persisted). */
let weightAxis: WeightAxis = 'import-edges';
/** Imported-surface honesty: estimate (Level-1) vs exact (LSP — not implemented). */
let locPrecision: LocPrecision = 'estimate';
/**
 * Viz-only dual BFS hop radius for file-hub (does not bound graph scan).
 * Default {@link HUB_DEFAULT_MAX_DEPTH} (3); package/module ignore depth.
 */
let vizMaxDepth = HUB_DEFAULT_MAX_DEPTH;
/** True after the user picks Depth manually (stops auto mode defaults). */
let depthUserSet = false;
/** Click behavior: drill navigates; inspect opens import evidence. */
type InteractionMode = 'drill' | 'inspect';
let interactionMode: InteractionMode = 'drill';

const WEIGHT_AXES: WeightAxis[] = ['import-edges', 'importer-loc', 'target-loc'];
const LOC_PRECISIONS: LocPrecision[] = ['estimate', 'exact'];
const VIZ_DEPTH_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12] as const;

function parseWeightAxis(raw: string): WeightAxis {
	return (WEIGHT_AXES as string[]).includes(raw) ? (raw as WeightAxis) : 'import-edges';
}

function parseLocPrecision(raw: string): LocPrecision {
	return (LOC_PRECISIONS as string[]).includes(raw)
		? (raw as LocPrecision)
		: 'estimate';
}

function parseInteractionMode(raw: string): InteractionMode {
	return raw === 'inspect' ? 'inspect' : 'drill';
}

function weightOpts(): { weightAxis: WeightAxis } {
	return { weightAxis };
}

function parseVizMaxDepth(raw: string): number {
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 1) return HUB_DEFAULT_MAX_DEPTH;
	return Math.min(32, Math.floor(n));
}

/** Default viz depth for file-hub (package/module ignore depth). */
function defaultDepthForView(_view: AtlasView): number {
	return HUB_DEFAULT_MAX_DEPTH;
}

/** Depth control is meaningful only for file-hub dual BFS radius. */
function viewUsesDepth(view: AtlasView | null): boolean {
	return view?.type === 'file-hub';
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

function vizDepthOpts(): { maxDepth: number; maxHopStages: number } {
	return { maxDepth: vizMaxDepth, maxHopStages: vizMaxDepth };
}

/** When exact + target-loc, refuse remount with estimate numbers. */
function canMountWeight(): { ok: true } | { ok: false; message: string } {
	const r = resolveWeightRequest(weightAxis, locPrecision);
	if (!r.ok) return { ok: false, message: r.message };
	return { ok: true };
}

/** Mount payload only when weight precision allows; never fake exact target-loc. */
function mountAlluvialGated(payload: AlluvialPayload | null): boolean {
	const gate = canMountWeight();
	if (!gate.ok) {
		setStatus(gate.message);
		return false;
	}
	mountAlluvial(payload);
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

function $(id: string): HTMLElement | null {
	return document.getElementById(id);
}

function setStatus(msg: string) {
	const workspaceStatus = $('atlas-status');
	const uploadStatus = $('atlas-upload-status');
	if (workspaceStatus) workspaceStatus.textContent = msg;
	if (uploadStatus && !$('atlas-upload')?.classList.contains('hidden')) {
		uploadStatus.textContent = msg;
	}
}

function showWarnings(warnings: string[]) {
	const host = $('atlas-warnings');
	if (!host) return;
	host.innerHTML = '';
	for (const w of warnings) {
		const n = document.createElement('cds-inline-notification');
		n.setAttribute('kind', 'warning');
		n.setAttribute('title', 'Warning');
		n.setAttribute('subtitle', w);
		n.setAttribute('low-contrast', '');
		n.setAttribute('hide-close-button', '');
		n.classList.add('atlas-warning-notification');
		host.appendChild(n);
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function destroyChart(): void {
	if (!chart) return;
	try {
		chart.destroy();
	} catch {
		/* Carbon can throw if holder already gone */
	}
	chart = null;
}

function currentView(): AtlasView | null {
	return viewStack.length ? viewStack[viewStack.length - 1]! : null;
}

function payloadForView(view: AtlasView): AlluvialPayload | null {
	if (!session) return null;
	const opts = weightOpts();
	const depth = vizDepthOpts();
	switch (view.type) {
		case 'file-hub':
			return projectFileHub(session.graph, view.fileId, {
				...opts,
				maxDepth: depth.maxDepth,
			});
		case 'package':
			return projectPackageImporters(session.graph, view.packageId, opts);
		case 'module':
			return projectModuleFocus(session.graph, view.moduleId, opts);
	}
}

function captionForView(view: AtlasView): string {
	switch (view.type) {
		case 'file-hub':
			return vizMaxDepth > 1
				? `Imports×${vizMaxDepth} → ${view.fileId} → Exports×${vizMaxDepth}`
				: `Imports → ${view.fileId} → Exports`;
		case 'package':
			return `Package · ${view.label} → imports`;
		case 'module':
			return `Module ends · ${view.moduleId}`;
	}
}

/** Sole file open policy: always file-hub traversal (startId only; one projector). */
function viewForFileOpen(fileId: string): AtlasView {
	return { type: 'file-hub', fileId };
}

function statusForView(view: AtlasView): string {
	switch (view.type) {
		case 'file-hub':
			return `Imports · Exports · ${view.fileId}`;
		case 'package':
			return `Package: ${view.label}`;
		case 'module':
			return `Module: ${view.moduleId}`;
	}
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
			? captionForView(view)
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
 * Pixel height available for the alluvial inside the stage.
 * Caps to remaining viewport under the chart top so dense multi-hop
 * projections cannot paint below the fold.
 */
function alluvialHeightPx(root: HTMLElement): number {
	const rect = root.getBoundingClientRect();
	const boxH = Math.floor(rect.height);
	// Space from chart top to viewport bottom (small bottom pad for OS chrome)
	const roomBelow = Math.floor(window.innerHeight - rect.top - 12);
	const capped = Math.min(
		boxH > 0 ? boxH : roomBelow,
		roomBelow > 0 ? roomBelow : boxH,
	);
	// Prefer measured stage; fall back if layout not settled yet
	const h = capped > 0 ? capped : Math.max(boxH, 360);
	return Math.max(240, h);
}

/**
 * Mount (or remount) alluvial. Always replaces the holder DOM node —
 * Carbon Charts leave residual SVG/state if you only clear innerHTML.
 * Binds node/line click handlers after construct.
 */
function mountAlluvial(payload: AlluvialPayload | null) {
	const root = $('atlas-alluvial');
	if (!root) return;

	destroyChart();
	root.replaceChildren();
	currentPayload = payload;

	const holder = document.createElement('div');
	holder.className = 'ui-carbon-chart__holder atlas-stage__holder';
	holder.setAttribute('data-carbon-chart-holder', '');
	root.appendChild(holder);

	if (!payload) {
		holder.innerHTML = `<p class="ui-carbon-chart__loading">No import flow for this start.</p>`;
		return;
	}

	// Prefer model update path when possible; full remount is the reliable fallback.
	try {
		const heightPx = alluvialHeightPx(root);
		const options = {
			...payload.options,
			height: `${heightPx}px`,
			animations: false,
		};
		chart = new AlluvialChart(holder, {
			data: payload.data,
			options,
		});
		// Top-pack columns; recolor File→Exports bands (Carbon uses source color).
		polishAlluvialHolder(holder, {
			colorScale: payload.options.color.scale,
		});
		bindAlluvialClicks(chart);
	} catch (err) {
		console.error('[atlas] alluvial mount failed', err);
		holder.innerHTML = `<p class="ui-carbon-chart__loading">Chart failed to load.</p>`;
		chart = null;
	}
}

/** Extract node display name from Carbon alluvial event datum. */
function datumName(raw: unknown): string | null {
	if (typeof raw === 'string') return raw;
	if (raw && typeof raw === 'object') {
		const o = raw as Record<string, unknown>;
		if (typeof o.name === 'string') return o.name;
	}
	return null;
}

function linkEndpointName(end: unknown): string | null {
	if (typeof end === 'string') return end;
	if (end && typeof end === 'object') {
		const o = end as Record<string, unknown>;
		if (typeof o.name === 'string') return o.name;
		// sankey may nest source/target as node objects
		if (o.source !== undefined || o.target !== undefined) return null;
	}
	return null;
}

function bindAlluvialClicks(instance: InstanceType<typeof AlluvialChart>): void {
	const events = (
		instance as unknown as {
			services?: { events?: EventTarget };
		}
	).services?.events;
	if (!events?.addEventListener) return;

	events.addEventListener('alluvial-node-click', ((e: Event) => {
		const detail = (e as CustomEvent).detail as {
			datum?: { name?: string };
		} | null;
		const name = datumName(detail?.datum);
		if (name) handleNodeClick(name);
	}) as EventListener);

	events.addEventListener('alluvial-line-click', ((e: Event) => {
		const detail = (e as CustomEvent).detail as {
			datum?: { source?: unknown; target?: unknown };
		} | null;
		const source = linkEndpointName(detail?.datum?.source);
		const target = linkEndpointName(detail?.datum?.target);
		if (source || target) handleLineClick(source, target);
	}) as EventListener);
}

function refForName(name: string): AlluvialNodeRef | null {
	return currentPayload?.meta.nodeRef[name] ?? null;
}

function sameView(a: AtlasView, b: AtlasView): boolean {
	if (a.type !== b.type) return false;
	if (a.type === 'file-hub' && b.type === 'file-hub') {
		return a.fileId === b.fileId;
	}
	if (a.type === 'package' && b.type === 'package') {
		return a.packageId === b.packageId;
	}
	if (a.type === 'module' && b.type === 'module') {
		return a.moduleId === b.moduleId;
	}
	return false;
}

function pushView(view: AtlasView): void {
	if (!session) return;
	const top = currentView();
	if (top && sameView(top, view)) return;

	// Mode default depth (hub 3) unless user set Depth manually
	const prevType = top?.type;
	if (prevType !== view.type) applyDepthDefaultForView(view);

	const payload = payloadForView(view);
	if (!payload) {
		setStatus(
			view.type === 'package'
				? `No importers for ${view.label}`
				: view.type === 'module'
					? `No package edges in ${view.moduleId}`
					: `No hub edges for ${view.fileId}`,
		);
		return;
	}
	viewStack.push(view);
	updateCaption(view);
	updateBackButton();
	syncDepthDropdown();
	if (mountAlluvialGated(payload)) {
		setStatus(statusForView(view));
	}
}

function popView(): void {
	if (viewStack.length <= 1) return;
	viewStack.pop();
	const view = currentView();
	if (!view || !session) return;
	applyDepthDefaultForView(view);
	updateCaption(view);
	updateBackButton();
	syncDepthDropdown();
	if (mountAlluvialGated(payloadForView(view))) {
		setStatus(statusForView(view));
	}
}

function drillFromRef(ref: AlluvialNodeRef, displayName: string): void {
	if (ref.kind === 'bucket') {
		setStatus(`Can't drill into aggregate “${displayName}”`);
		return;
	}
	if (ref.kind === 'file') {
		pushView(viewForFileOpen(ref.id));
		return;
	}
	if (ref.kind === 'package' || ref.kind === 'unresolved') {
		pushView({ type: 'package', packageId: ref.id, label: displayName });
		return;
	}
	if (ref.kind === 'module') {
		pushView({ type: 'module', moduleId: ref.id });
	}
}

function closeInspectModal(): void {
	const modal = $('atlas-inspect-modal') as (HTMLElement & { open?: boolean }) | null;
	if (modal) modal.open = false;
}

function appendCodeBlock(
	parent: HTMLElement,
	pathHtml: string,
	text: string,
): void {
	const path = document.createElement('div');
	path.className = 'atlas-inspect__path';
	path.innerHTML = pathHtml;
	const code = document.createElement('pre');
	code.className = 'atlas-inspect__code';
	code.textContent = text;
	parent.append(path, code);
}

function openInspectModal(
	title: string,
	evidence: ImportEvidence[],
	emptyHint: string,
): void {
	const modal = $('atlas-inspect-modal') as (HTMLElement & { open?: boolean }) | null;
	const heading = $('atlas-inspect-heading');
	const label = $('atlas-inspect-label');
	const body = $('atlas-inspect-body');
	if (!modal || !heading || !body) return;

	heading.textContent = title;
	if (label) {
		label.textContent =
			locPrecision === 'exact'
				? 'Import evidence · exact unavailable'
				: 'Import evidence · estimate';
	}
	body.replaceChildren();

	if (!evidence.length) {
		const p = document.createElement('p');
		p.className = 'atlas-inspect__empty';
		p.textContent = emptyHint;
		body.appendChild(p);
		modal.open = true;
		return;
	}

	const meta = document.createElement('p');
	meta.className = 'atlas-inspect__meta';
	meta.textContent =
		evidence.length === 1
			? '1 observed import statement'
			: `${evidence.length} observed import statements`;
	body.appendChild(meta);

	const anyExactBlocker = evidence.some((ev) =>
		ev.blockers.some((b) => b.code === 'exact-not-implemented'),
	);
	if (anyExactBlocker) {
		const banner = document.createElement('cds-inline-notification');
		banner.setAttribute('kind', 'warning');
		banner.setAttribute('title', 'Exact mode');
		banner.setAttribute('subtitle', EXACT_NOT_IMPLEMENTED_MESSAGE);
		banner.setAttribute('low-contrast', '');
		banner.setAttribute('hide-close-button', '');
		banner.classList.add('atlas-inspect__banner');
		body.appendChild(banner);
	}

	const list = document.createElement('ul');
	list.className = 'atlas-inspect__list';

	for (const ev of evidence) {
		const li = document.createElement('li');
		li.className = 'atlas-inspect__item';

		// Import statement (always observed when present)
		const impSec = document.createElement('div');
		impSec.className = 'atlas-inspect__section';
		const impH = document.createElement('div');
		impH.className = 'atlas-inspect__section-title';
		impH.textContent = 'Import';
		impSec.appendChild(impH);
		appendCodeBlock(
			impSec,
			`${escapeHtml(ev.import.path)} <span class="atlas-inspect__line-num">L${ev.import.line}</span> <span class="atlas-inspect__form">${escapeHtml(ev.import.form)}</span>`,
			ev.import.text,
		);
		li.appendChild(impSec);

		// Imported code (estimate only)
		const codeSec = document.createElement('div');
		codeSec.className = 'atlas-inspect__section';
		const codeH = document.createElement('div');
		codeH.className = 'atlas-inspect__section-title';
		codeH.textContent = 'Imported code';
		codeSec.appendChild(codeH);
		if (ev.importedCode) {
			appendCodeBlock(
				codeSec,
				`${escapeHtml(ev.importedCode.path)} <span class="atlas-inspect__line-num">L${ev.importedCode.startLine}–${ev.importedCode.endLine}</span> <span class="atlas-inspect__form">${escapeHtml(ev.importedCode.note)}</span>`,
				ev.importedCode.text,
			);
		} else {
			const note = document.createElement('p');
			note.className = 'atlas-inspect__section-empty';
			const blocker =
				ev.blockers.find((b) => b.code === 'exact-not-implemented') ??
				ev.blockers.find((b) => b.code === 'package-target' || b.code === 'no-source');
			note.textContent = blocker?.message ?? 'No imported code excerpt available.';
			codeSec.appendChild(note);
		}
		li.appendChild(codeSec);

		// Callsites (estimate only)
		const callSec = document.createElement('div');
		callSec.className = 'atlas-inspect__section';
		const callH = document.createElement('div');
		callH.className = 'atlas-inspect__section-title';
		callH.textContent =
			locPrecision === 'exact'
				? 'Callsites (exact unavailable)'
				: 'Possible callsites (estimate — not type-checked)';
		callSec.appendChild(callH);
		if (ev.callsites.length) {
			for (const cs of ev.callsites) {
				appendCodeBlock(
					callSec,
					`${escapeHtml(cs.path)} <span class="atlas-inspect__line-num">L${cs.line}</span> <span class="atlas-inspect__form">${escapeHtml(cs.symbol)}</span>`,
					cs.text,
				);
			}
		} else {
			const note = document.createElement('p');
			note.className = 'atlas-inspect__section-empty';
			const blocker = ev.blockers.find(
				(b) => b.code === 'exact-not-implemented' || b.code === 'no-bindings',
			);
			note.textContent =
				blocker?.message ?? 'No estimated callsites found for import bindings.';
			callSec.appendChild(note);
		}
		li.appendChild(callSec);

		list.appendChild(li);
	}

	body.appendChild(list);
	modal.open = true;
}

function inspectNode(name: string, ref: AlluvialNodeRef): void {
	if (!session) return;
	if (ref.kind === 'bucket') {
		openInspectModal(
			name,
			[],
			'Aggregate buckets have no single import statement — drill or pick a concrete node.',
		);
		return;
	}
	const edges = edgesForNode(session.graph, ref);
	const evidence = evidenceForEdges(session.graph, edges, locPrecision);
	openInspectModal(
		name,
		evidence,
		'No observed import lines for this node in the current graph.',
	);
}

function inspectBand(sourceName: string | null, targetName: string | null): void {
	if (!session) return;
	const sourceRef = sourceName ? refForName(sourceName) : null;
	const targetRef = targetName ? refForName(targetName) : null;
	const title = [sourceName, targetName].filter(Boolean).join(' → ') || 'Band';
	const edges = edgesForBand(session.graph, sourceRef, targetRef);
	const evidence = evidenceForEdges(session.graph, edges, locPrecision);
	openInspectModal(
		title,
		evidence,
		'No observed import lines for this band (aggregate or unresolved topology).',
	);
}

function handleNodeClick(name: string): void {
	const ref = refForName(name);
	if (!ref) {
		setStatus(
			interactionMode === 'inspect'
				? `No inspect target for “${name}”`
				: `No drill target for “${name}”`,
		);
		return;
	}
	if (interactionMode === 'inspect') {
		inspectNode(name, ref);
		return;
	}
	drillFromRef(ref, name);
}

/**
 * Line click: prefer file target, else package source, else module source, else package target.
 * Inspect mode opens import-line evidence instead of navigating.
 */
function handleLineClick(sourceName: string | null, targetName: string | null): void {
	if (interactionMode === 'inspect') {
		inspectBand(sourceName, targetName);
		return;
	}

	const sourceRef = sourceName ? refForName(sourceName) : null;
	const targetRef = targetName ? refForName(targetName) : null;

	if (targetRef?.kind === 'file') {
		drillFromRef(targetRef, targetName!);
		return;
	}
	if (sourceRef?.kind === 'package' || sourceRef?.kind === 'unresolved') {
		drillFromRef(sourceRef, sourceName!);
		return;
	}
	if (sourceRef?.kind === 'module') {
		drillFromRef(sourceRef, sourceName!);
		return;
	}
	if (targetRef?.kind === 'package' || targetRef?.kind === 'unresolved') {
		drillFromRef(targetRef, targetName!);
		return;
	}
	if (targetRef?.kind === 'module') {
		drillFromRef(targetRef, targetName!);
		return;
	}
	if (sourceRef?.kind === 'file') {
		drillFromRef(sourceRef, sourceName!);
		return;
	}
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

function parseableSetFromGraph(): Set<string> {
	const g = session?.graph;
	if (!g) return new Set();
	if (g.parseMap?.size) {
		const s = new Set<string>();
		for (const [path, entry] of g.parseMap) {
			if (entry.importParseable) s.add(path);
		}
		return s;
	}
	// Fallback if older in-memory shape
	const s = new Set<string>();
	for (const [path, node] of g.files) {
		if (node.isSource) s.add(path);
	}
	return s;
}

function parseNotesFromGraph(): Map<string, string> {
	const g = session?.graph;
	const m = new Map<string, string>();
	if (!g) return m;
	if (g.parseMap?.size) {
		for (const [path, entry] of g.parseMap) {
			m.set(path, entry.note);
		}
		return m;
	}
	for (const [path, node] of g.files) {
		if (node.parseNote) m.set(path, node.parseNote);
	}
	return m;
}

/** Read cds-search / input value from the tree filter host. */
function treeFilterValue(): string {
	const el = $('atlas-tree-filter') as (HTMLElement & { value?: string }) | null;
	if (!el) return '';
	return typeof el.value === 'string' ? el.value : '';
}

function renderTree() {
	const host = $('atlas-tree');
	if (!host || !session) return;
	host.replaceChildren();

	const filter = treeFilterValue();
	const paths = [...session.graph.files.keys()];
	const tree = buildFileTree(paths, {
		importParseable: parseableSetFromGraph(),
		parseNotes: parseNotesFromGraph(),
	});
	const q = filter.trim();

	// When filtering, force-open matching ancestors (merge with user expand state)
	if (q) {
		for (const p of expandPathsForFilter(paths, q)) {
			session.expanded.add(p);
		}
	}

	const frag = document.createDocumentFragment();
	for (const child of tree.children) {
		if (!nodeMatchesFilter(child, q)) continue;
		frag.appendChild(renderTreeNode(child, 0, q));
	}
	host.appendChild(frag);

	if (!host.childElementCount) {
		host.innerHTML = `<p class="px-2 py-1 text-xs text-zinc-600">No files match.</p>`;
	}
}

/** True when `dirPath` is a path prefix of the active start file (breadcrumb folders). */
function isAncestorOfActiveFile(dirPath: string, startId: string | null | undefined): boolean {
	if (!startId || !dirPath) return false;
	return startId === dirPath || startId.startsWith(`${dirPath}/`);
}

function renderTreeNode(
	node: FileTreeNode,
	depth: number,
	filter: string,
): HTMLElement {
	if (node.kind === 'dir') {
		const wrap = document.createElement('div');
		wrap.className = 'atlas-tree__dir';
		wrap.setAttribute('role', 'group');

		const open = session!.expanded.has(node.path);
		const onActivePath = isAncestorOfActiveFile(node.path, session?.startId);
		const row = document.createElement('button');
		row.type = 'button';
		row.className = 'atlas-tree__row atlas-tree__row--dir';
		if (node.unparseable) row.classList.add('is-unparseable');
		// Purple only for expanded folders that lead to the selected file
		if (open && onActivePath && !node.unparseable) {
			row.classList.add('is-active-path');
		}
		row.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
		row.setAttribute('aria-expanded', open ? 'true' : 'false');
		row.dataset.path = node.path;
		const dirTitle = node.unparseable
			? `${node.path} — no import-parseable files in this folder`
			: node.path;
		row.title = dirTitle;
		row.innerHTML = `
			<span class="atlas-tree__chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
			<span class="atlas-tree__icon" aria-hidden="true">${treeIconSvg('dir', node.path, { open })}</span>
			<span class="atlas-tree__name truncate">${escapeHtml(node.name)}</span>
			<span class="atlas-tree__badge">${node.children.length}</span>
		`;
		row.addEventListener('click', (e) => {
			e.preventDefault();
			if (!session) return;
			if (session.expanded.has(node.path)) session.expanded.delete(node.path);
			else session.expanded.add(node.path);
			persistSessionIfEnabled();
			renderTree();
		});
		wrap.appendChild(row);

		if (open) {
			const kids = document.createElement('div');
			kids.className = 'atlas-tree__children';
			for (const c of node.children) {
				if (!nodeMatchesFilter(c, filter)) continue;
				kids.appendChild(renderTreeNode(c, depth + 1, filter));
			}
			wrap.appendChild(kids);
		}
		return wrap;
	}

	// file — greying from parseMap / tree annotation (not ad-hoc extension checks)
	const isSrc = node.isSource;
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'atlas-tree__row atlas-tree__row--file';
	if (isSrc) btn.classList.add('is-source');
	else btn.classList.add('is-unparseable');
	if (session?.startId === node.path) btn.classList.add('is-selected');
	btn.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
	btn.dataset.path = node.path;
	const note = node.parseNote || session?.graph.parseMap.get(node.path)?.note || '';
	btn.title = note ? `${node.path}\n${note}` : node.path;
	btn.setAttribute('aria-disabled', isSrc ? 'false' : 'true');

	btn.innerHTML = `
		<span class="atlas-tree__chevron atlas-tree__chevron--spacer" aria-hidden="true"></span>
		<span class="atlas-tree__icon${isSrc ? ' atlas-tree__icon--source' : ' atlas-tree__icon--muted'}" aria-hidden="true">${treeIconSvg('file', node.path)}</span>
		<span class="atlas-tree__name truncate">${escapeHtml(node.name)}</span>
	`;
	btn.addEventListener('click', () => {
		if (isSrc) {
			selectStart(node.path);
			return;
		}
		const entry = session?.graph.parseMap.get(node.path);
		const why = entry?.note || note || 'Not import-parseable at Level-1';
		setStatus(`${node.path}: ${why}`);
	});
	return btn;
}

/**
 * Catalog edge chips: cyan count = inbound (imports), yellow count = outbound
 * (exports). Label is the number only; omit a side when its count is 0.
 */
function edgeBadge(outDegree: number, inDegree: number): string {
	const parts: string[] = [];
	if (inDegree > 0) {
		parts.push(
			`<cds-tag type="teal" size="sm" class="atlas-edge-badge atlas-edge-badge--in ui-tag" title="in ${inDegree}">${inDegree}</cds-tag>`,
		);
	}
	if (outDegree > 0) {
		parts.push(
			`<cds-tag size="sm" class="atlas-edge-badge atlas-edge-badge--out ui-tag ui-tag--yellow" title="out ${outDegree}">${outDegree}</cds-tag>`,
		);
	}
	if (!parts.length) return '';
	return `<span class="atlas-edge-badges">${parts.join('')}</span>`;
}

/** Catalog / subbar chip via Carbon tag (dynamic create). */
function makeSummaryTag(text: string, type: 'teal' | 'gray' = 'gray'): HTMLElement {
	const tag = document.createElement('cds-tag');
	tag.setAttribute('type', type);
	tag.setAttribute('size', 'sm');
	tag.classList.add('ui-tag', 'atlas-summary-tag');
	tag.textContent = text;
	return tag;
}

function badgeTagHtml(label: string, title: string): string {
	return `<cds-tag type="teal" size="sm" class="atlas-edge-badge ui-tag" title="${escapeHtml(title)}">${escapeHtml(label)}</cds-tag>`;
}

function setAccordionTitle(id: string, title: string): void {
	const el = $(id) as (HTMLElement & { title: string }) | null;
	if (!el) return;
	// Carbon cds-accordion-item uses the `title` property/attribute for the heading
	el.setAttribute('title', title);
	el.title = title;
}

function renderCatalog(catalog: MapCatalog, selectedStart: string | null) {
	const summary = $('atlas-catalog-summary');
	if (summary) {
		const langs = catalog.summary.languages.join(' · ') || 'JS/TS';
		summary.textContent = `${langs} · ${catalog.summary.sourceCount} src · ${catalog.summary.edgeCount} edges · ${catalog.summary.packageCount} pkgs`;
	}

	// Accordion section titles with counts (Carbon cds-accordion-item title prop)
	const hotspotN = catalog.hotspots?.length ?? 0;
	const complexN = catalog.complex?.length ?? 0;
	const deepN = catalog.deepest?.length ?? 0;
	const viewsN = catalog.views.length;
	const startsN = Math.min(catalog.starts.length, 25);
	const endsN = Math.min(catalog.ends.length, 30);
	setAccordionTitle(
		'atlas-acc-hotspots',
		`High edges${hotspotN ? ` (${hotspotN})` : ''}`,
	);
	setAccordionTitle(
		'atlas-acc-complex',
		`Tree complexity${complexN ? ` (${complexN})` : ''}`,
	);
	setAccordionTitle('atlas-acc-views', `Suggested views${viewsN ? ` (${viewsN})` : ''}`);
	setAccordionTitle('atlas-acc-starts', `Starts${startsN ? ` (${startsN})` : ''}`);
	setAccordionTitle('atlas-acc-ends', `Ends${endsN ? ` (${endsN})` : ''}`);
	setAccordionTitle(
		'atlas-acc-deepest',
		`Tree depth${deepN ? ` (${deepN})` : ''}`,
	);

	const tags = $('atlas-summary-tags');
	if (tags) {
		tags.replaceChildren();
		for (const lang of catalog.summary.languages) {
			tags.appendChild(makeSummaryTag(lang, 'teal'));
		}
	}

	const hotspotsHost = $('atlas-hotspots');
	if (hotspotsHost) {
		hotspotsHost.innerHTML = '';
		const list = catalog.hotspots ?? [];
		for (const h of list.slice(0, 15)) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'atlas-list-btn';
			if (selectedStart === h.id) btn.classList.add('is-selected');
			const hub =
				h.inDegree > h.outDegree
					? ' · fan-in'
					: h.packageOut
						? ` · ${h.packageOut} pkg`
						: '';
			const detail = `out ${h.outDegree} · in ${h.inDegree}${hub}`;
			btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(h.path)}</span>
					${edgeBadge(h.outDegree, h.inDegree)}
				</span>
				<span class="meta">observed · ${escapeHtml(detail)}</span>`;
			btn.addEventListener('click', () => selectStart(h.id));
			hotspotsHost.appendChild(btn);
		}
		if (!list.length) {
			hotspotsHost.innerHTML = `<p class="text-xs text-zinc-600">No edges yet.</p>`;
		}
	}

	const complexHost = $('atlas-complex');
	if (complexHost) {
		complexHost.innerHTML = '';
		const list = catalog.complex ?? [];
		for (const c of list.slice(0, 15)) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'atlas-list-btn';
			if (selectedStart === c.id) btn.classList.add('is-selected');
			const edgesLabel =
				c.downwindEdges === 1 ? '1 edge' : `${c.downwindEdges} edges`;
			const detail = `${c.downwindEdges} downwind · ${c.packageEnds} pkgs · ${c.maxHops} hops · ${c.reachableFiles} files`;
			btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(c.path)}</span>
					${badgeTagHtml(edgesLabel, detail)}
				</span>
				<span class="meta">observed · ${escapeHtml(detail)}</span>`;
			// Catalog only picks start; all file opens use file-hub
			btn.addEventListener('click', () => selectStart(c.id));
			complexHost.appendChild(btn);
		}
		if (!list.length) {
			complexHost.innerHTML = `<p class="text-xs text-zinc-600">No downwind edges yet.</p>`;
		}
	}

	const deepestHost = $('atlas-deepest');
	if (deepestHost) {
		deepestHost.innerHTML = '';
		const list = catalog.deepest ?? [];
		for (const d of list.slice(0, 15)) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'atlas-list-btn';
			if (selectedStart === d.id) btn.classList.add('is-selected');
			const hopsLabel = d.maxHops === 1 ? '1 hop' : `${d.maxHops} hops`;
			const detail = `${d.reachableFiles} files · ${d.packageEnds} pkgs · out ${d.outDegree}`;
			btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(d.path)}</span>
					${badgeTagHtml(hopsLabel, detail)}
				</span>
				<span class="meta">observed · ${escapeHtml(detail)}</span>`;
			btn.addEventListener('click', () => selectStart(d.id));
			deepestHost.appendChild(btn);
		}
		if (!list.length) {
			deepestHost.innerHTML = `<p class="text-xs text-zinc-600">No deep import chains.</p>`;
		}
	}

	const viewsHost = $('atlas-views');
	if (viewsHost) {
		viewsHost.innerHTML = '';
		for (const v of catalog.views) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'atlas-list-btn';
			if (selectedStart === v.startId) btn.classList.add('is-selected');
			const startMeta = catalog.starts.find((s) => s.id === v.startId);
			const hotMeta = catalog.hotspots?.find((h) => h.id === v.startId);
			const deepMeta = catalog.deepest?.find((d) => d.id === v.startId);
			const complexMeta = catalog.complex?.find((c) => c.id === v.startId);
			const outD =
				startMeta?.outDegree ??
				hotMeta?.outDegree ??
				complexMeta?.outDegree ??
				deepMeta?.outDegree ??
				v.edgeCount ??
				0;
			const inD =
				startMeta?.inDegree ??
				hotMeta?.inDegree ??
				complexMeta?.inDegree ??
				deepMeta?.inDegree ??
				0;
			const badge =
				typeof v.edgeCount === 'number' ||
				startMeta ||
				hotMeta ||
				complexMeta ||
				deepMeta
					? edgeBadge(outD, inD)
					: '';
			btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<strong class="text-sm text-zinc-100">${escapeHtml(v.title)}</strong>
					${badge}
				</span>
				<span class="meta">${escapeHtml(v.description)}</span>`;
			// Catalog bins only choose startId; projector is always file-hub
			btn.addEventListener('click', () => selectStart(v.startId));
			viewsHost.appendChild(btn);
		}
		if (!catalog.views.length) {
			viewsHost.innerHTML = `<p class="text-xs text-zinc-600">No views — no source files found.</p>`;
		}
	}

	const startsHost = $('atlas-starts');
	if (startsHost) {
		startsHost.innerHTML = '';
		for (const s of catalog.starts.slice(0, 25)) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'atlas-list-btn';
			if (selectedStart === s.id) btn.classList.add('is-selected');
			btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(s.path)}</span>
					${edgeBadge(s.outDegree, s.inDegree)}
				</span>
				<span class="meta">inferred · ${escapeHtml(s.reason)} · out ${s.outDegree} · in ${s.inDegree}</span>`;
			btn.addEventListener('click', () => selectStart(s.id));
			startsHost.appendChild(btn);
		}
	}

	const endsHost = $('atlas-ends');
	if (endsHost) {
		endsHost.innerHTML = '';
		for (const e of catalog.ends.slice(0, 30)) {
			const row = document.createElement('button');
			row.type = 'button';
			row.className = 'atlas-list-btn atlas-list-btn--end';
			const kindColor =
				e.kind === 'unresolved'
					? 'text-amber-400'
					: e.kind === 'builtin'
						? 'text-teal-300'
						: 'text-zinc-200';
			// Ends only have inbound degree (importers of the package)
			row.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="${kindColor} truncate text-sm font-medium" title="${escapeHtml(e.id)}">${escapeHtml(e.label)}</span>
					${edgeBadge(0, e.inDegree)}
				</span>
				<span class="meta">${escapeHtml(e.kind)} · ${e.inDegree} importer${e.inDegree === 1 ? '' : 's'}</span>`;
			row.addEventListener('click', () => {
				pushView({ type: 'package', packageId: e.id, label: e.label });
			});
			endsHost.appendChild(row);
		}
	}
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
	session = next;
	showWarnings(session.warnings);
	showWorkspaceShell();
	renderCatalog(session.catalog, session.startId);
	if (session.startId) selectStart(session.startId, { skipPersist: true });
	else {
		renderTree();
		setStatus(statusLine);
	}
	setStatus(statusLine);
	if (!opts?.skipPersist) persistSessionIfEnabled();
}

function expandToPath(startId: string): void {
	if (!session) return;
	const parts = startId.split('/');
	for (let i = 1; i < parts.length; i++) {
		session.expanded.add(parts.slice(0, i).join('/'));
	}
}

function openFileView(view: AtlasView, startId: string, opts?: { skipPersist?: boolean }) {
	if (!session) return;
	session.startId = startId;
	expandToPath(startId);
	viewStack = [view];
	applyDepthDefaultForView(view);
	renderTree();
	renderCatalog(session.catalog, startId);
	updateCaption(view);
	updateBackButton();
	syncDepthDropdown();
	if (mountAlluvialGated(payloadForView(view))) {
		setStatus(statusForView(view));
	}
	if (!opts?.skipPersist) persistSessionIfEnabled();
}

/** Catalog / tree / restore / drill: always open file-hub at startId. */
function selectStart(startId: string, opts?: { skipPersist?: boolean }) {
	if (!session) return;
	openFileView(viewForFileOpen(startId), startId, opts);
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
	const { graph, catalog } = indexFiles(files);
	const paths = [...graph.files.keys()];
	const prefix = opts?.statusPrefix ?? 'Indexed';
	activateSession(
		{
			graph,
			catalog,
			startId: catalog.starts[0]?.id ?? null,
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
		const { graph, catalog } = indexFiles(stored.files);
		const startId =
			stored.startId && graph.files.has(stored.startId)
				? stored.startId
				: (catalog.starts[0]?.id ?? null);
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
				catalog,
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
	currentPayload = null;
	// Fresh session gets hub depth default again
	depthUserSet = false;
	vizMaxDepth = HUB_DEFAULT_MAX_DEPTH;
	clearPersistedSession();
	destroyChart();
	const alluvial = $('atlas-alluvial');
	if (alluvial) alluvial.replaceChildren();
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

function wirePersistCheckbox(): void {
	const box = persistCheckbox();
	if (!box) return;
	box.checked = readPersistPreference();
	// Carbon checkbox fires cds-checkbox-changed (not native change alone)
	box.addEventListener('cds-checkbox-changed', () => {
		const on = Boolean(box.checked);
		writePersistPreference(on);
		if (on) {
			if (session) persistSessionIfEnabled();
		} else {
			clearPersistedSession();
		}
	});
}

function wireUi() {
	wirePersistCheckbox();

	const drop = $('atlas-drop');
	// Carbon file-uploader drop container: click + drag both emit this event
	drop?.addEventListener('cds-file-uploader-drop-container-changed', ((e: Event) => {
		const files = (e as CustomEvent<{ addedFiles?: File[] }>).detail?.addedFiles;
		const f = files?.[0];
		if (f) void handleZip(f);
	}) as EventListener);

	$('atlas-reset')?.addEventListener('click', resetSession);

	$('atlas-alluvial-back')?.addEventListener('click', () => {
		popView();
	});

	const weightDropdown = $('atlas-weight-axis') as (HTMLElement & { value?: string }) | null;
	if (weightDropdown) {
		weightDropdown.value = weightAxis;
		weightDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof weightDropdown.value === 'string' ? weightDropdown.value : '');
			weightAxis = parseWeightAxis(next);
			remountCurrentView();
		}) as EventListener);
	}

	const depthDropdown = $('atlas-max-depth') as (HTMLElement & { value?: string }) | null;
	if (depthDropdown) {
		syncDepthDropdown();
		depthDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof depthDropdown.value === 'string' ? depthDropdown.value : '');
			vizMaxDepth = parseVizMaxDepth(next);
			depthUserSet = true;
			remountCurrentView();
		}) as EventListener);
	}

	const precisionDropdown = $('atlas-loc-precision') as (HTMLElement & {
		value?: string;
	}) | null;
	if (precisionDropdown) {
		precisionDropdown.value = locPrecision;
		precisionDropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof precisionDropdown.value === 'string'
					? precisionDropdown.value
					: 'estimate');
			locPrecision = parseLocPrecision(next);
			if (locPrecision === 'exact' && weightAxis === 'target-loc') {
				setStatus(EXACT_NOT_IMPLEMENTED_MESSAGE);
				// Do not remount with estimate numbers labeled as exact
				return;
			}
			if (locPrecision === 'estimate') {
				remountCurrentView();
			} else {
				// exact + non-target-loc: chart still valid; status notes mode
				setStatus('Exact mode — imported surface analysis not implemented (LSP)');
				remountCurrentView();
			}
		}) as EventListener);
	}

	const modeSwitch = $('atlas-interaction-mode') as (HTMLElement & { value?: string }) | null;
	if (modeSwitch) {
		modeSwitch.value = interactionMode;
		modeSwitch.addEventListener('cds-content-switcher-selected', ((e: Event) => {
			const detail = (e as CustomEvent).detail as {
				item?: { value?: string };
			} | null;
			const next =
				detail?.item?.value ??
				(typeof modeSwitch.value === 'string' ? modeSwitch.value : 'drill');
			interactionMode = parseInteractionMode(next);
			setStatus(
				interactionMode === 'inspect'
					? 'Inspect mode — click for import evidence'
					: 'Drill mode',
			);
		}) as EventListener);
	}

	$('atlas-inspect-close')?.addEventListener('click', () => {
		closeInspectModal();
	});

	$('atlas-demo-react-simple')?.addEventListener('click', () => {
		handleDemo('react-simple');
	});
	$('atlas-demo-next-complex')?.addEventListener('click', () => {
		handleDemo('next-complex');
	});

	const treeFilter = $('atlas-tree-filter');
	// Carbon search: cds-search-input; also listen for input if it bubbles
	const onTreeFilter = () => {
		if (!session) return;
		renderTree();
	};
	treeFilter?.addEventListener('cds-search-input', onTreeFilter);
	treeFilter?.addEventListener('input', onTreeFilter);

	// Remount chart on resize so height tracks stage (keep current drill view)
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	window.addEventListener('resize', () => {
		if (!currentView()) return;
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (!currentView()) return;
			remountCurrentView();
		}, 150);
	});

	updateBackButton();
	tryRestoreSession();
}

wireUi();
