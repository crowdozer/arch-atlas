/**
 * Client controller: ZIP upload → index → catalog / tree / alluvial.
 * Analysis is local-only; optional localStorage remember (upload checkbox).
 */
import { AlluvialChart } from '@carbon/charts';
import '@carbon/charts/styles.css';
import {
	alluvialForStart,
	indexFiles,
	ingestZip,
	isSourceFile,
	projectModuleFocus,
	projectPackageImporters,
	type AlluvialNodeRef,
	type AlluvialPayload,
	type CodeGraph,
	type MapCatalog,
	type VirtualFile,
} from '@core/index.ts';
import {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
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

/** Nested alluvial focus (top of stack = current view). */
type AtlasView =
	| { type: 'file'; fileId: string }
	| { type: 'package'; packageId: string; label: string }
	| { type: 'module'; moduleId: string };

let session: Session | null = null;
let chart: InstanceType<typeof AlluvialChart> | null = null;
/** Drill-down stack; not persisted in v1. */
let viewStack: AtlasView[] = [];
/** Last mounted payload (for click resolution). */
let currentPayload: AlluvialPayload | null = null;

function persistCheckbox(): HTMLInputElement | null {
	return $('atlas-persist') as HTMLInputElement | null;
}

function isPersistEnabled(): boolean {
	return persistCheckbox()?.checked ?? readPersistPreference();
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
		const p = document.createElement('p');
		p.className = 'text-xs text-amber-400';
		p.textContent = w;
		host.appendChild(p);
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
	switch (view.type) {
		case 'file':
			return alluvialForStart(session.graph, view.fileId);
		case 'package':
			return projectPackageImporters(session.graph, view.packageId);
		case 'module':
			return projectModuleFocus(session.graph, view.moduleId);
	}
}

function captionForView(view: AtlasView): string {
	switch (view.type) {
		case 'file':
			return `Modules → code for ${view.fileId}`;
		case 'package':
			return `Package importers · ${view.label}`;
		case 'module':
			return `Module ends · ${view.moduleId}`;
	}
}

function updateBackButton(): void {
	const btn = $('atlas-alluvial-back') as HTMLButtonElement | null;
	if (!btn) return;
	const deep = viewStack.length > 1;
	btn.classList.toggle('hidden', !deep);
	btn.disabled = !deep;
}

function updateCaption(view: AtlasView | null): void {
	const caption = $('atlas-alluvial-caption');
	if (!caption) return;
	caption.textContent = view
		? captionForView(view)
		: 'Select a start to project modules → code.';
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
		const heightPx = Math.max(
			320,
			Math.floor(root.getBoundingClientRect().height || 480),
		);
		const options = {
			...payload.options,
			height: `${heightPx}px`,
			animations: false,
		};
		chart = new AlluvialChart(holder, {
			data: payload.data,
			options,
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

function pushView(view: AtlasView): void {
	if (!session) return;
	// Avoid pushing identical focus
	const top = currentView();
	if (
		top &&
		top.type === view.type &&
		((view.type === 'file' && top.type === 'file' && top.fileId === view.fileId) ||
			(view.type === 'package' &&
				top.type === 'package' &&
				top.packageId === view.packageId) ||
			(view.type === 'module' &&
				top.type === 'module' &&
				top.moduleId === view.moduleId))
	) {
		return;
	}
	const payload = payloadForView(view);
	if (!payload) {
		setStatus(
			view.type === 'package'
				? `No importers for ${view.label}`
				: view.type === 'module'
					? `No package edges in ${view.moduleId}`
					: `No import flow for ${view.fileId}`,
		);
		return;
	}
	viewStack.push(view);
	updateCaption(view);
	updateBackButton();
	mountAlluvial(payload);
	setStatus(
		view.type === 'file'
			? `Start: ${view.fileId}`
			: view.type === 'package'
				? `Package: ${view.label}`
				: `Module: ${view.moduleId}`,
	);
}

function popView(): void {
	if (viewStack.length <= 1) return;
	viewStack.pop();
	const view = currentView();
	if (!view || !session) return;
	updateCaption(view);
	updateBackButton();
	mountAlluvial(payloadForView(view));
	setStatus(
		view.type === 'file'
			? `Start: ${view.fileId}`
			: view.type === 'package'
				? `Package: ${view.label}`
				: `Module: ${view.moduleId}`,
	);
}

function drillFromRef(ref: AlluvialNodeRef, displayName: string): void {
	if (ref.kind === 'bucket') {
		setStatus(`Can't drill into aggregate “${displayName}”`);
		return;
	}
	if (ref.kind === 'file') {
		pushView({ type: 'file', fileId: ref.id });
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

function handleNodeClick(name: string): void {
	const ref = refForName(name);
	if (!ref) {
		setStatus(`No drill target for “${name}”`);
		return;
	}
	drillFromRef(ref, name);
}

/**
 * Line click: prefer file target, else package source, else module source, else package target.
 */
function handleLineClick(sourceName: string | null, targetName: string | null): void {
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
	mountAlluvial(payloadForView(view));
}

function renderTree() {
	const host = $('atlas-tree');
	if (!host || !session) return;
	host.replaceChildren();

	const filter =
		($('atlas-tree-filter') as HTMLInputElement | null)?.value ?? '';
	const paths = [...session.graph.files.keys()];
	const tree = buildFileTree(paths);
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
		const row = document.createElement('button');
		row.type = 'button';
		row.className = 'atlas-tree__row atlas-tree__row--dir';
		row.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
		row.setAttribute('aria-expanded', open ? 'true' : 'false');
		row.dataset.path = node.path;
		row.innerHTML = `
			<span class="atlas-tree__chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
			<span class="atlas-tree__icon" aria-hidden="true">${treeIconSvg('dir', node.path, { open })}</span>
			<span class="atlas-tree__name truncate">${escapeHtml(node.name)}</span>
			<span class="atlas-tree__badge">${node.children.length}</span>
		`;
		row.title = node.path;
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

	// file
	const isSrc = isSourceFile(node.path);
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'atlas-tree__row atlas-tree__row--file';
	if (isSrc) btn.classList.add('is-source');
	if (session?.startId === node.path) btn.classList.add('is-selected');
	btn.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
	btn.dataset.path = node.path;
	btn.title = node.path; // full path on hover — disambiguates index.tsx siblings

	btn.innerHTML = `
		<span class="atlas-tree__chevron atlas-tree__chevron--spacer" aria-hidden="true"></span>
		<span class="atlas-tree__icon${isSrc ? ' atlas-tree__icon--source' : ''}" aria-hidden="true">${treeIconSvg('file', node.path)}</span>
		<span class="atlas-tree__name truncate">${escapeHtml(node.name)}</span>
	`;
	btn.addEventListener('click', () => {
		if (isSrc) selectStart(node.path);
		else setStatus(`Not a source file: ${node.path}`);
	});
	return btn;
}

function renderCatalog(catalog: MapCatalog, selectedStart: string | null) {
	const summary = $('atlas-catalog-summary');
	if (summary) {
		const langs = catalog.summary.languages.join(' · ') || 'JS/TS';
		summary.textContent = `${langs} · ${catalog.summary.sourceCount} src · ${catalog.summary.edgeCount} edges · ${catalog.summary.packageCount} pkgs`;
	}

	const tags = $('atlas-summary-tags');
	if (tags) {
		tags.innerHTML = '';
		for (const lang of catalog.summary.languages) {
			const span = document.createElement('span');
			span.className =
				'rounded bg-zinc-800 px-2 py-0.5 text-[0.7rem] text-teal-300 ring-1 ring-zinc-700';
			span.textContent = lang;
			tags.appendChild(span);
		}
		const obs = document.createElement('span');
		obs.className =
			'rounded bg-zinc-800 px-2 py-0.5 text-[0.7rem] text-zinc-400 ring-1 ring-zinc-700';
		obs.textContent = 'Observed imports';
		tags.appendChild(obs);
		const inf = document.createElement('span');
		inf.className =
			'rounded bg-zinc-800 px-2 py-0.5 text-[0.7rem] text-zinc-400 ring-1 ring-zinc-700';
		inf.textContent = 'Inferred starts';
		tags.appendChild(inf);
	}

	const viewsHost = $('atlas-views');
	if (viewsHost) {
		viewsHost.innerHTML = '';
		for (const v of catalog.views) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'atlas-list-btn';
			if (selectedStart === v.startId) btn.classList.add('is-selected');
			btn.innerHTML = `<strong class="text-sm text-zinc-100">${escapeHtml(v.title)}</strong><span class="meta">${escapeHtml(v.description)}</span>`;
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
			btn.innerHTML = `<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(s.path)}</span><span class="meta">inferred · ${escapeHtml(s.reason)}</span>`;
			btn.addEventListener('click', () => selectStart(s.id));
			startsHost.appendChild(btn);
		}
	}

	const endsHost = $('atlas-ends');
	if (endsHost) {
		endsHost.innerHTML = '';
		for (const e of catalog.ends.slice(0, 30)) {
			const row = document.createElement('div');
			row.className =
				'mb-1 flex items-center justify-between gap-2 rounded border border-zinc-800 px-2 py-1 text-xs';
			const kindColor =
				e.kind === 'unresolved'
					? 'text-amber-400'
					: e.kind === 'builtin'
						? 'text-teal-300'
						: 'text-zinc-300';
			row.innerHTML = `<span class="${kindColor} truncate" title="${escapeHtml(e.id)}">${escapeHtml(e.label)}</span><span class="shrink-0 text-zinc-600">${e.kind} · in ${e.inDegree}</span>`;
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

function selectStart(startId: string, opts?: { skipPersist?: boolean }) {
	if (!session) return;
	session.startId = startId;
	// ensure parents of selected file are expanded
	const parts = startId.split('/');
	for (let i = 1; i < parts.length; i++) {
		session.expanded.add(parts.slice(0, i).join('/'));
	}
	// Tree/catalog selection resets drill stack to file focus
	const view: AtlasView = { type: 'file', fileId: startId };
	viewStack = [view];
	renderTree();
	renderCatalog(session.catalog, startId);
	updateCaption(view);
	updateBackButton();
	mountAlluvial(payloadForView(view));
	setStatus(`Start: ${startId}`);
	if (!opts?.skipPersist) persistSessionIfEnabled();
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
		`${prefix} ${graph.stats.sourceCount} sources · ${graph.stats.edgeCount} edges`,
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
	clearPersistedSession();
	destroyChart();
	const alluvial = $('atlas-alluvial');
	if (alluvial) alluvial.replaceChildren();
	updateCaption(null);
	updateBackButton();

	$('atlas-workspace')?.classList.add('hidden');
	$('atlas-subbar')?.classList.add('hidden');
	$('atlas-subbar')?.classList.remove('flex');
	$('atlas-upload')?.classList.remove('hidden');
	setStatus('');
	const uploadStatus = $('atlas-upload-status');
	if (uploadStatus) uploadStatus.textContent = '';
	showWarnings([]);
	const file = $('atlas-file') as HTMLInputElement | null;
	if (file) file.value = '';
}

function wirePersistCheckbox(): void {
	const box = persistCheckbox();
	if (!box) return;
	box.checked = readPersistPreference();
	box.addEventListener('change', () => {
		writePersistPreference(box.checked);
		if (box.checked) {
			if (session) persistSessionIfEnabled();
		} else {
			clearPersistedSession();
		}
	});
}

function wireUi() {
	wirePersistCheckbox();

	const drop = $('atlas-drop');
	const input = $('atlas-file') as HTMLInputElement | null;

	input?.addEventListener('change', () => {
		const f = input.files?.[0];
		if (f) void handleZip(f);
	});

	if (drop) {
		drop.addEventListener('dragover', (e) => {
			e.preventDefault();
			drop.classList.add('is-active');
		});
		drop.addEventListener('dragleave', () => drop.classList.remove('is-active'));
		drop.addEventListener('drop', (e) => {
			e.preventDefault();
			drop.classList.remove('is-active');
			const f = e.dataTransfer?.files?.[0];
			if (f) void handleZip(f);
		});
	}

	$('atlas-reset')?.addEventListener('click', resetSession);

	$('atlas-alluvial-back')?.addEventListener('click', () => {
		popView();
	});

	$('atlas-demo-react-simple')?.addEventListener('click', () => {
		handleDemo('react-simple');
	});
	$('atlas-demo-next-complex')?.addEventListener('click', () => {
		handleDemo('next-complex');
	});

	$('atlas-tree-filter')?.addEventListener('input', () => {
		if (!session) return;
		renderTree();
	});

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
