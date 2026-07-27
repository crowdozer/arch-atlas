/**
 * Map catalog paint (web Carbon shell). Injected callbacks — does not import app.ts.
 */
import type { MapCatalog } from '@core/index.ts';
import type { AtlasView } from '@shell/atlasView.ts';
import { $, escapeHtml } from './dom.ts';

export type CatalogRenderDeps = {
	selectStart: (id: string) => void;
	navigatePush: (view: AtlasView) => boolean | void;
};

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

export function createCatalogRenderer(deps: CatalogRenderDeps): {
	renderCatalog: (catalog: MapCatalog, selectedStart: string | null) => void;
} {
	function renderCatalog(catalog: MapCatalog, selectedStart: string | null): void {
		const summary = $('atlas-catalog-summary');
		if (summary) {
			const langs = catalog.summary.languages.join(' · ') || 'JS/TS';
			summary.textContent = `${langs} · ${catalog.summary.sourceCount} src · ${catalog.summary.edgeCount} edges · ${catalog.summary.packageCount} pkgs`;
		}

		// Accordion section titles with counts (Carbon cds-accordion-item title prop)
		const hotspotN = catalog.hotspots?.length ?? 0;
		const complexN = catalog.complex?.length ?? 0;
		const deepN = catalog.deepest?.length ?? 0;
		const fileLocN = catalog.fileLoc?.length ?? 0;
		const blastN = catalog.blastRadius?.length ?? 0;
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
		setAccordionTitle(
			'atlas-acc-deepest',
			`Tree depth${deepN ? ` (${deepN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-file-loc',
			`File LOC${fileLocN ? ` (${fileLocN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-blast',
			`Blast radius${blastN ? ` (${blastN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-views',
			`Suggested views${viewsN ? ` (${viewsN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-starts',
			`Starts${startsN ? ` (${startsN})` : ''}`,
		);
		setAccordionTitle('atlas-acc-ends', `Ends${endsN ? ` (${endsN})` : ''}`);

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
				btn.addEventListener('click', () => deps.selectStart(h.id));
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
				btn.addEventListener('click', () => deps.selectStart(c.id));
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
				btn.addEventListener('click', () => deps.selectStart(d.id));
				deepestHost.appendChild(btn);
			}
			if (!list.length) {
				deepestHost.innerHTML = `<p class="text-xs text-zinc-600">No deep import chains.</p>`;
			}
		}

		const fileLocHost = $('atlas-file-loc');
		if (fileLocHost) {
			fileLocHost.innerHTML = '';
			const list = catalog.fileLoc ?? [];
			for (const f of list.slice(0, 15)) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'atlas-list-btn';
				if (selectedStart === f.id) btn.classList.add('is-selected');
				const locLabel = `${f.loc} LOC`;
				const detail = `out ${f.outDegree} · in ${f.inDegree}`;
				btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(f.path)}</span>
					${badgeTagHtml(locLabel, `${f.loc} lines of code · ${detail}`)}
				</span>
				<span class="meta">observed · ${escapeHtml(detail)}</span>`;
				btn.addEventListener('click', () => deps.selectStart(f.id));
				fileLocHost.appendChild(btn);
			}
			if (!list.length) {
				fileLocHost.innerHTML = `<p class="text-xs text-zinc-600">No source LOC yet.</p>`;
			}
		}

		const blastHost = $('atlas-blast');
		if (blastHost) {
			blastHost.innerHTML = '';
			const list = catalog.blastRadius ?? [];
			for (const b of list.slice(0, 15)) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'atlas-list-btn';
				if (selectedStart === b.id) btn.classList.add('is-selected');
				const reachLabel =
					b.reverseReachFiles === 1
						? '1 consumer'
						: `${b.reverseReachFiles} consumers`;
				const detail = `${b.reverseReachFiles} reverse · ${b.reverseMaxHops} hops · in ${b.inDegree} · out ${b.outDegree}`;
				btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(b.path)}</span>
					${badgeTagHtml(reachLabel, detail)}
				</span>
				<span class="meta">observed · ${escapeHtml(detail)}</span>`;
				btn.addEventListener('click', () => deps.selectStart(b.id));
				blastHost.appendChild(btn);
			}
			if (!list.length) {
				blastHost.innerHTML = `<p class="text-xs text-zinc-600">No reverse consumers yet.</p>`;
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
				const fileLocMeta = catalog.fileLoc?.find((f) => f.id === v.startId);
				const blastMeta = catalog.blastRadius?.find((b) => b.id === v.startId);
				const outD =
					startMeta?.outDegree ??
					hotMeta?.outDegree ??
					complexMeta?.outDegree ??
					deepMeta?.outDegree ??
					fileLocMeta?.outDegree ??
					blastMeta?.outDegree ??
					v.edgeCount ??
					0;
				const inD =
					startMeta?.inDegree ??
					hotMeta?.inDegree ??
					complexMeta?.inDegree ??
					deepMeta?.inDegree ??
					fileLocMeta?.inDegree ??
					blastMeta?.inDegree ??
					0;
				const badge =
					typeof v.edgeCount === 'number' ||
					startMeta ||
					hotMeta ||
					complexMeta ||
					deepMeta ||
					fileLocMeta ||
					blastMeta
						? edgeBadge(outD, inD)
						: '';
				btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<strong class="text-sm text-zinc-100">${escapeHtml(v.title)}</strong>
					${badge}
				</span>
				<span class="meta">${escapeHtml(v.description)}</span>`;
				// Catalog bins only choose startId; projector is always file-hub
				btn.addEventListener('click', () => deps.selectStart(v.startId));
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
				btn.addEventListener('click', () => deps.selectStart(s.id));
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
					deps.navigatePush({
						type: 'package',
						packageId: e.id,
						label: e.label,
					});
				});
				endsHost.appendChild(row);
			}
		}
	}

	return { renderCatalog };
}
