/**
 * Map catalog paint (web Carbon shell). Injected callbacks — does not import app.ts.
 */
import {
	ICEBERG_MAX_RATIO,
	MIN_PRIVATE,
	MIN_WHOLE,
	PUBLIC_MIN_RATIO,
	type MapCatalog,
	type SpineFormula,
} from '@core/index.ts';
import {
	SPINE_FORMULA_HONESTY_FOOTER,
	spineFormulaHelp,
} from '@shell/index.ts';
import { $, escapeHtml } from './dom.ts';

export type CatalogRenderDeps = {
	selectStart: (id: string) => void;
	/**
	 * Export Roots: open package sink as file-hub on its primary importer
	 * (host resolves package → file).
	 */
	openPackage: (packageId: string, label: string) => void;
	/** Current spine formula (for select sync). */
	getSpineFormula?: () => SpineFormula;
	/** User changed formula select. */
	onSpineFormulaChange?: (formula: string) => void;
	/** Open formula help modal for current selection. */
	onSpineFormulaInfo?: () => void;
};

/** Paint-only flags (not stored on MapCatalog / session). */
export type CatalogPaintOpts = {
	/**
	 * True when Exact surface overlay was applied (precision exact + provider).
	 * Distinguishes “Needs Exact” empty from “no files under floors.”
	 */
	massExactReady?: boolean;
	/**
	 * Sticky package open intent (Export Roots / package drill). When set,
	 * matching Export Roots row gets is-selected. Not a startId.
	 */
	selectedPackage?: string | null;
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

function ratioPct(ratio: number): string {
	return `${Math.round(ratio * 100)}%`;
}

export function createCatalogRenderer(deps: CatalogRenderDeps): {
	renderCatalog: (
		catalog: MapCatalog,
		selectedStart: string | null,
		opts?: CatalogPaintOpts,
	) => void;
	wireSpineControls: () => void;
} {
	let spineControlsWired = false;

	function wireSpineControls(): void {
		if (spineControlsWired) return;
		spineControlsWired = true;
		const dropdown = $('atlas-spine-formula') as
			| (HTMLElement & { value?: string })
			| null;
		if (dropdown && deps.onSpineFormulaChange) {
			dropdown.addEventListener('cds-dropdown-selected', ((e: Event) => {
				const detail = (e as CustomEvent).detail as {
					item?: { value?: string };
				} | null;
				const next =
					detail?.item?.value ??
					(typeof dropdown.value === 'string' ? dropdown.value : '');
				deps.onSpineFormulaChange?.(next);
			}) as EventListener);
		}
		const info = $('atlas-spine-formula-info');
		if (info && deps.onSpineFormulaInfo) {
			info.addEventListener('click', () => deps.onSpineFormulaInfo?.());
		}
		const close = $('atlas-spine-formula-close');
		if (close) {
			close.addEventListener('click', () => {
				const modal = $('atlas-spine-formula-modal') as
					| (HTMLElement & { open?: boolean })
					| null;
				if (modal) modal.open = false;
			});
		}
	}

	function syncSpineFormulaSelect(formula: SpineFormula): void {
		const dropdown = $('atlas-spine-formula') as
			| (HTMLElement & { value?: string })
			| null;
		if (!dropdown) return;
		if (dropdown.value !== formula) {
			dropdown.value = formula;
		}
	}

	function renderCatalog(
		catalog: MapCatalog,
		selectedStart: string | null,
		opts?: CatalogPaintOpts,
	): void {
		wireSpineControls();
		const massExactReady = opts?.massExactReady === true;

		const summary = $('atlas-catalog-summary');
		if (summary) {
			const langs = catalog.summary.languages.join(' · ') || 'source';
			summary.textContent = `${langs} · ${catalog.summary.sourceCount} src · ${catalog.summary.edgeCount} edges · ${catalog.summary.packageCount} pkgs`;
		}

		// Accordion section titles with counts (Carbon cds-accordion-item title prop)
		const hotspotN = catalog.hotspots?.length ?? 0;
		const complexN = catalog.complex?.length ?? 0;
		const deepN = catalog.deepest?.length ?? 0;
		const fileLocN = catalog.fileLoc?.length ?? 0;
		const publicMassN = catalog.publicMass?.length ?? 0;
		const icebergsN = catalog.icebergs?.length ?? 0;
		const spinesN = catalog.spines?.length ?? 0;
		const blastN = catalog.blastRadius?.length ?? 0;
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
			'atlas-acc-public-mass',
			`Public mass${publicMassN ? ` (${publicMassN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-icebergs',
			`Icebergs${icebergsN ? ` (${icebergsN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-spines',
			`Spines${spinesN ? ` (${spinesN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-blast',
			`Blast radius${blastN ? ` (${blastN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-starts',
			`Import Roots${startsN ? ` (${startsN})` : ''}`,
		);
		setAccordionTitle(
			'atlas-acc-ends',
			`Export Roots${endsN ? ` (${endsN})` : ''}`,
		);

		const formula =
			deps.getSpineFormula?.() ??
			catalog.spineFormula ??
			'modules-then-in';
		syncSpineFormulaSelect(formula);

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

		const publicMassHost = $('atlas-public-mass');
		if (publicMassHost) {
			publicMassHost.innerHTML = '';
			const list = catalog.publicMass ?? [];
			for (const f of list.slice(0, 15)) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'atlas-list-btn';
				if (selectedStart === f.id) btn.classList.add('is-selected');
				const badge = `${f.surfaceLoc} surface`;
				const detail = `whole ${f.wholeLoc} · ratio ${ratioPct(f.ratio)} · in ${f.inDegree}`;
				btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(f.path)}</span>
					${badgeTagHtml(badge, detail)}
				</span>
				<span class="meta">observed · export-surface · ${escapeHtml(detail)}</span>`;
				btn.addEventListener('click', () => deps.selectStart(f.id));
				publicMassHost.appendChild(btn);
			}
			if (!list.length) {
				publicMassHost.innerHTML = massExactReady
					? `<p class="text-xs text-zinc-600">No public-mass files under current floors (whole ≥ ${MIN_WHOLE}, ratio ≥ ${PUBLIC_MIN_RATIO}).</p>`
					: `<p class="text-xs text-zinc-600">Needs Exact (export surface) — ratio of exported lines to whole file.</p>`;
			}
		}

		const icebergsHost = $('atlas-icebergs');
		if (icebergsHost) {
			icebergsHost.innerHTML = '';
			const list = catalog.icebergs ?? [];
			for (const f of list.slice(0, 15)) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'atlas-list-btn';
				if (selectedStart === f.id) btn.classList.add('is-selected');
				const badge = `${f.privateLoc} private`;
				const detail = `whole ${f.wholeLoc} · surface ${f.surfaceLoc} · ratio ${ratioPct(f.ratio)}`;
				btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(f.path)}</span>
					${badgeTagHtml(badge, detail)}
				</span>
				<span class="meta">observed · export-surface · ${escapeHtml(detail)}</span>`;
				btn.addEventListener('click', () => deps.selectStart(f.id));
				icebergsHost.appendChild(btn);
			}
			if (!list.length) {
				icebergsHost.innerHTML = massExactReady
					? `<p class="text-xs text-zinc-600">No iceberg files under current floors (whole ≥ ${MIN_WHOLE}, ratio ≤ ${ICEBERG_MAX_RATIO}, private ≥ ${MIN_PRIVATE}).</p>`
					: `<p class="text-xs text-zinc-600">Needs Exact (export surface) — large private body under smaller export surface.</p>`;
			}
		}

		const spinesHost = $('atlas-spines');
		if (spinesHost) {
			spinesHost.innerHTML = '';
			const list = catalog.spines ?? [];
			for (const s of list.slice(0, 15)) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'atlas-list-btn';
				if (selectedStart === s.id) btn.classList.add('is-selected');
				const modulesLabel =
					s.importerModuleCount === 1
						? '1 module'
						: `${s.importerModuleCount} modules`;
				const detail = `in ${s.inDegree} · modules ${s.importerModuleCount} · reverse ${s.reverseReachFiles}`;
				btn.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="text-sm font-medium text-zinc-100 break-all">${escapeHtml(s.path)}</span>
					${badgeTagHtml(modulesLabel, detail)}
				</span>
				<span class="meta">observed · ${escapeHtml(detail)}</span>`;
				btn.addEventListener('click', () => deps.selectStart(s.id));
				spinesHost.appendChild(btn);
			}
			if (!list.length) {
				spinesHost.innerHTML = `<p class="text-xs text-zinc-600">No cross-cutting spines yet.</p>`;
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
			const selectedPackage = opts?.selectedPackage ?? null;
			for (const e of catalog.ends.slice(0, 30)) {
				const row = document.createElement('button');
				row.type = 'button';
				row.className = 'atlas-list-btn atlas-list-btn--end';
				if (
					selectedPackage &&
					(selectedPackage === e.label || selectedPackage === e.id)
				) {
					row.classList.add('is-selected');
				}
				const kindColor =
					e.kind === 'unresolved'
						? 'text-amber-400'
						: e.kind === 'builtin'
							? 'text-teal-300'
							: 'text-zinc-200';
				// Export roots: inbound degree only (importers of the package)
				row.innerHTML = `
				<span class="atlas-list-btn__row">
					<span class="${kindColor} truncate text-sm font-medium" title="${escapeHtml(e.id)}">${escapeHtml(e.label)}</span>
					${edgeBadge(0, e.inDegree)}
				</span>
				<span class="meta">${escapeHtml(e.kind)} · ${e.inDegree} importer${e.inDegree === 1 ? '' : 's'}</span>`;
				row.addEventListener('click', () => {
					deps.openPackage(e.id, e.label);
				});
				endsHost.appendChild(row);
			}
		}
	}

	return { renderCatalog, wireSpineControls };
}

/** Open the spine formula help modal for the given mode. */
export function openSpineFormulaHelpModal(formula: SpineFormula): void {
	const help = spineFormulaHelp(formula);
	const modal = $('atlas-spine-formula-modal') as
		| (HTMLElement & { open?: boolean })
		| null;
	const heading = $('atlas-spine-formula-heading');
	const label = $('atlas-spine-formula-label');
	const body = $('atlas-spine-formula-body');
	const keys = $('atlas-spine-formula-keys');
	const honesty = $('atlas-spine-formula-honesty');
	if (heading) heading.textContent = help.title;
	if (label) label.textContent = 'Spine ranking';
	if (body) body.textContent = help.body;
	if (keys) keys.textContent = `Sort: ${help.sortKeys}`;
	if (honesty) honesty.textContent = SPINE_FORMULA_HONESTY_FOOTER;
	if (modal) modal.open = true;
}
