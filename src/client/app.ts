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

type Session = {
	graph: CodeGraph;
	catalog: MapCatalog;
	startId: string | null;
	warnings: string[];
};

let session: Session | null = null;
let chart: AlluvialChart | null = null;

function $(id: string): HTMLElement | null {
	return document.getElementById(id);
}

function setStatus(msg: string) {
	const el = $('atlas-status');
	if (el) el.textContent = msg;
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

function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i >= 0 ? path.slice(i + 1) : path;
}

/** Build a simple expandable path list (flat sorted paths with indent). */
function renderTree(graph: CodeGraph, filter: string, selected: string | null) {
	const host = $('atlas-tree');
	if (!host) return;
	host.innerHTML = '';
	const q = filter.trim().toLowerCase();
	const paths = [...graph.files.keys()]
		.filter((p) => !q || p.toLowerCase().includes(q))
		.sort((a, b) => a.localeCompare(b));

	for (const path of paths) {
		const depth = path.split('/').length - 1;
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.dataset.path = path;
		const source = isSourceFile(path);
		if (source) btn.classList.add('is-source');
		if (selected === path) btn.classList.add('is-selected');
		btn.innerHTML = `<span class="indent" style="width:${depth * 0.75}rem"></span><span class="truncate">${escapeHtml(basename(path))}</span>`;
		btn.title = path;
		btn.addEventListener('click', () => {
			if (source) selectStart(path);
			else setStatus(`Not a source file: ${path}`);
		});
		host.appendChild(btn);
	}
	if (!paths.length) {
		host.innerHTML = `<p class="px-1 text-xs text-zinc-600">No files match.</p>`;
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderCatalog(catalog: MapCatalog, selectedStart: string | null) {
	const summary = $('atlas-catalog-summary');
	if (summary) {
		const langs = catalog.summary.languages.join(' · ') || 'JS/TS';
		summary.textContent = `${langs} · ${catalog.summary.sourceCount} sources · ${catalog.summary.edgeCount} import edges · ${catalog.summary.packageCount} packages · ${catalog.summary.unresolvedCount} unresolved`;
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
			btn.innerHTML = `<span class="text-sm font-medium text-zinc-100">${escapeHtml(s.path)}</span><span class="meta">inferred · ${escapeHtml(s.reason)}</span>`;
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
	const filter = ($('atlas-tree-filter') as HTMLInputElement | null)?.value ?? '';
	renderTree(session.graph, filter, startId);
	renderCatalog(session.catalog, startId);
	const caption = $('atlas-alluvial-caption');
	if (caption) caption.textContent = `Import surface from ${startId}`;
	const payload = alluvialForStart(session.graph, startId);
	mountAlluvial(payload);
	setStatus(`Start: ${startId}`);
}

function mountAlluvial(payload: AlluvialPayload | null) {
	const root = $('atlas-alluvial');
	const holder = root?.querySelector('[data-carbon-chart-holder]') as HTMLDivElement | null;
	if (!holder) return;

	if (chart) {
		try {
			// @ts-expect-error carbon charts destroy is optional across versions
			chart.destroy?.();
		} catch {
			/* ignore */
		}
		chart = null;
	}
	holder.innerHTML = '';

	if (!payload) {
		holder.innerHTML = `<p class="ui-carbon-chart__loading">No import flow for this start.</p>`;
		return;
	}

	try {
		chart = new AlluvialChart(holder, {
			data: payload.data,
			options: payload.options,
		});
	} catch (err) {
		console.error(err);
		holder.innerHTML = `<p class="ui-carbon-chart__loading">Chart failed to load.</p>`;
	}
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
		session = {
			graph,
			catalog,
			startId: catalog.starts[0]?.id ?? null,
			warnings: [
				...warnings,
				skipped ? `Skipped ${skipped} ignored/binary paths.` : '',
			].filter(Boolean),
		};
		showWarnings(session.warnings);
		$('atlas-upload')?.classList.add('hidden');
		$('atlas-workspace')?.classList.remove('hidden');
		const filter = ($('atlas-tree-filter') as HTMLInputElement | null)?.value ?? '';
		renderTree(graph, filter, session.startId);
		renderCatalog(catalog, session.startId);
		if (session.startId) selectStart(session.startId);
		else setStatus('Indexed — no source starts found.');
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
	if (chart) {
		try {
			// @ts-expect-error optional
			chart.destroy?.();
		} catch {
			/* ignore */
		}
		chart = null;
	}
	$('atlas-workspace')?.classList.add('hidden');
	$('atlas-upload')?.classList.remove('hidden');
	setStatus('');
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

	$('atlas-tree-filter')?.addEventListener('input', (e) => {
		if (!session) return;
		const v = (e.target as HTMLInputElement).value;
		renderTree(session.graph, v, session.startId);
	});
}

wireUi();
