/**
 * Client controller: ZIP upload → index → catalog / tree / alluvial.
 * Analysis is local-only (in-memory session).
 */
import { AlluvialChart } from '@carbon/charts';
import '@carbon/charts/styles.css';
import {
	alluvialForStart,
	indexFiles,
	ingestZip,
	isSourceFile,
	type AlluvialPayload,
	type CodeGraph,
	type MapCatalog,
} from '@core/index.ts';
import {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
import { treeIconSvg } from './treeIcons.ts';

type Session = {
	graph: CodeGraph;
	catalog: MapCatalog;
	startId: string | null;
	warnings: string[];
	/** Dir paths currently expanded in the tree. */
	expanded: Set<string>;
};

let session: Session | null = null;
let chart: InstanceType<typeof AlluvialChart> | null = null;

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

/**
 * Mount (or remount) alluvial. Always replaces the holder DOM node —
 * Carbon Charts leave residual SVG/state if you only clear innerHTML.
 */
function mountAlluvial(payload: AlluvialPayload | null) {
	const root = $('atlas-alluvial');
	if (!root) return;

	destroyChart();
	root.replaceChildren();

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
	} catch (err) {
		console.error('[atlas] alluvial mount failed', err);
		holder.innerHTML = `<p class="ui-carbon-chart__loading">Chart failed to load.</p>`;
		chart = null;
	}
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

function selectStart(startId: string) {
	if (!session) return;
	session.startId = startId;
	// ensure parents of selected file are expanded
	const parts = startId.split('/');
	for (let i = 1; i < parts.length; i++) {
		session.expanded.add(parts.slice(0, i).join('/'));
	}
	renderTree();
	renderCatalog(session.catalog, startId);
	const caption = $('atlas-alluvial-caption');
	if (caption) caption.textContent = `Modules → code for ${startId}`;
	const payload = alluvialForStart(session.graph, startId);
	mountAlluvial(payload);
	setStatus(`Start: ${startId}`);
}

async function handleZip(file: File) {
	setStatus(`Reading ${file.name}…`);
	showWarnings([]);
	try {
		const buf = await file.arrayBuffer();
		setStatus('Unpacking ZIP…');
		const { files, skipped, warnings } = ingestZip(buf);
		if (!files.length) {
			setStatus('No readable text files in ZIP.');
			return;
		}
		setStatus(`Indexing ${files.length} files…`);
		const { graph, catalog } = indexFiles(files);
		const paths = [...graph.files.keys()];
		session = {
			graph,
			catalog,
			startId: catalog.starts[0]?.id ?? null,
			warnings: [
				...warnings,
				skipped ? `Skipped ${skipped} ignored/binary paths.` : '',
			].filter(Boolean),
			expanded: expandPathsForFilter(paths, ''),
		};
		showWarnings(session.warnings);
		$('atlas-upload')?.classList.add('hidden');
		// CSS: .atlas-workspace is display:flex; .atlas-workspace.hidden is none
		$('atlas-workspace')?.classList.remove('hidden');
		$('atlas-subbar')?.classList.remove('hidden');
		$('atlas-subbar')?.classList.add('flex');
		renderCatalog(catalog, session.startId);
		if (session.startId) selectStart(session.startId);
		else {
			renderTree();
			setStatus('Indexed — no source starts found.');
		}
		setStatus(
			`Indexed ${graph.stats.sourceCount} sources · ${graph.stats.edgeCount} edges`,
		);
	} catch (err) {
		console.error(err);
		setStatus(err instanceof Error ? err.message : String(err));
	}
}

function resetSession() {
	session = null;
	destroyChart();
	const alluvial = $('atlas-alluvial');
	if (alluvial) alluvial.replaceChildren();

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

function wireUi() {
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

	$('atlas-tree-filter')?.addEventListener('input', () => {
		if (!session) return;
		renderTree();
	});

	// Remount chart on resize so height tracks stage
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	window.addEventListener('resize', () => {
		if (!session?.startId) return;
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (!session?.startId) return;
			mountAlluvial(alluvialForStart(session.graph, session.startId));
		}, 150);
	});
}

wireUi();
