/**
 * Inspect + unavailable modal paint (web Carbon shell).
 * Injected deps — does not import app.ts. Evidence from @core.
 */
import {
	EXACT_NOT_IMPLEMENTED_MESSAGE,
	edgesForBand,
	edgesForNode,
	evidenceForEdges,
	type AlluvialNodeRef,
	type ImportEvidence,
	type ImportedSurfaceProvider,
	type LocPrecision,
} from '@core/index.ts';
import type { StatusPresentation } from '@shell/statusIndicator.ts';
import type { Session } from '@shell/types.ts';
import { $, escapeHtml } from './dom.ts';
import { createStatusIndicatorEl } from './statusIndicatorDom.ts';

const ACCORDION_TITLE_MAX = 80;

export type InspectModalDeps = {
	/**
	 * Chrome precision (dropdown). Used for honesty headers so Program stays
	 * labeled Program even when Exact mass is rehydrated.
	 */
	getLocPrecision: () => LocPrecision;
	/**
	 * Precision for export-surface evidence / callsite copy. Host remaps
	 * program+programExactMass → `'exact'` (shell `precisionForSurfaceClaims`);
	 * defaults to chrome when omitted.
	 */
	getPrecisionForSurfaceClaims?: () => LocPrecision;
	getSession: () => Session | null;
	/** Exact surface provider when engines are ready (null under estimate). */
	getSurface?: () => ImportedSurfaceProvider | null;
	/** Resolve alluvial display name → node ref (from current payload). */
	refForName: (name: string) => AlluvialNodeRef | null;
};

export type ImportForm = ImportEvidence['import']['form'];

/** Direction chrome for path rows / accordion titles. */
export type DirectionKind = 'import' | 'export' | 'mixed';

/**
 * Direction marker for an observed edge form.
 * - import / require / dynamic → right-facing blue triangle (inbound)
 * - export → left-facing cyan triangle (outbound)
 * - mixed → purple solid circle (indeterminate — both directions)
 * Carbon triangle glyphs point up; rotation is applied via CSS class.
 */
export type FormDirectionMarker = {
	direction: DirectionKind;
	label: string;
	title: string;
	/** Host class: rotate + color (blue import / cyan export / purple mixed). */
	className: string;
};

/** Pure map: edge form → direction marker chrome (never mixed). */
export function formDirectionMarker(form: ImportForm): FormDirectionMarker {
	if (form === 'export') {
		return {
			direction: 'export',
			label: 'export',
			title: 'Export',
			className: 'atlas-inspect__form-tri atlas-inspect__form-tri--export',
		};
	}
	if (form === 'require') {
		return {
			direction: 'import',
			label: 'require',
			title: 'require()',
			className: 'atlas-inspect__form-tri atlas-inspect__form-tri--import',
		};
	}
	if (form === 'dynamic') {
		return {
			direction: 'import',
			label: 'dynamic',
			title: 'Dynamic import',
			className: 'atlas-inspect__form-tri atlas-inspect__form-tri--import',
		};
	}
	return {
		direction: 'import',
		label: 'import',
		title: 'Import',
		className: 'atlas-inspect__form-tri atlas-inspect__form-tri--import',
	};
}

/**
 * Accordion title direction for one evidence row without a focus file.
 * Defaults to the edge's observed form (not section presence).
 *
 * Prefer {@link perspectiveDirectionKind} when the inspected file is known —
 * inbound consumers of the focus file are **export** from the focus POV.
 */
export function accordionDirectionKind(ev: ImportEvidence): DirectionKind {
	return formDirectionMarker(ev.import.form).direction;
}

/**
 * Direction relative to the inspected file (alluvial node focus).
 *
 * Edge geometry: statement lives at `ev.import.path` (`from`); target is
 * `ev.import.toLabel` / `ev.importedCode.path`.
 *
 * - Focus owns the statement → form as-is (import/require/dynamic = import;
 *   export-from = export).
 * - Focus is the **target** of an import-family edge → **export** (someone
 *   imports us; e.g. `main.tsx` → `App.tsx` while inspecting App).
 * - Focus is the target of an export-from edge → still export-family chrome
 *   (re-export of our bindings) — treat as export.
 * - No focus / unmatched → form fallback.
 */
export function perspectiveDirectionKind(
	focusFileId: string | null | undefined,
	ev: ImportEvidence,
): DirectionKind {
	const formDir = formDirectionMarker(ev.import.form).direction;
	if (!focusFileId) return formDir;

	const statementFile = ev.import.path;
	if (focusFileId === statementFile) return formDir;

	const targetIds = new Set<string>();
	if (ev.import.toLabel) targetIds.add(ev.import.toLabel);
	if (ev.importedCode?.path) targetIds.add(ev.importedCode.path);

	if (targetIds.has(focusFileId)) {
		// Inbound: consumer statement elsewhere targets this file.
		return 'export';
	}
	return formDir;
}

/**
 * Collapse multiple edge forms (e.g. if one accordion row ever represents
 * several statements). Only then use purple indeterminate.
 */
export function accordionDirectionFromForms(
	forms: readonly ImportForm[],
): DirectionKind {
	if (!forms.length) return 'import';
	const dirs = new Set(
		forms.map((f) => formDirectionMarker(f).direction),
	);
	if (dirs.has('import') && dirs.has('export')) return 'mixed';
	if (dirs.has('export') && !dirs.has('import')) return 'export';
	return 'import';
}

/** Per-site row for inspect modal summaries / tests. */
export type InspectSiteSummary = {
	edgeId: string;
	statementPath: string;
	line: number;
	form: ImportForm;
	/** Form-only direction (syntax). */
	formDirection: DirectionKind;
	/** Perspective direction vs focus file (import / export / mixed). */
	direction: DirectionKind;
	toLabel: string;
	title: string;
	/** Callsite symbols (name-scan), unique stable order. */
	symbols: string[];
	hasImportedCode: boolean;
	callsiteCount: number;
};

/** Aggregate chrome counts for the modal meta line + tests. */
export type InspectEvidenceSummary = {
	total: number;
	importCount: number;
	exportCount: number;
	mixedCount: number;
	/** Human meta line painted above the accordion. */
	metaLabel: string;
	sites: InspectSiteSummary[];
};

/**
 * Pure summary of modal evidence: per-site symbols + import/export counts
 * relative to an optional focus file.
 */
export function summarizeInspectEvidence(
	evidence: readonly ImportEvidence[],
	focusFileId?: string | null,
): InspectEvidenceSummary {
	const sites: InspectSiteSummary[] = evidence.map((ev) => {
		const formDirection = formDirectionMarker(ev.import.form).direction;
		const direction = perspectiveDirectionKind(focusFileId, ev);
		const symbolSet = new Set<string>();
		for (const cs of ev.callsites) {
			if (cs.symbol) symbolSet.add(cs.symbol);
		}
		return {
			edgeId: ev.edgeId,
			statementPath: ev.import.path,
			line: ev.import.line,
			form: ev.import.form,
			formDirection,
			direction,
			toLabel: ev.import.toLabel,
			title: importSiteAccordionTitle(ev),
			symbols: [...symbolSet].sort((a, b) => a.localeCompare(b)),
			hasImportedCode: Boolean(ev.importedCode),
			callsiteCount: ev.callsites.length,
		};
	});

	let importCount = 0;
	let exportCount = 0;
	let mixedCount = 0;
	for (const s of sites) {
		if (s.direction === 'import') importCount += 1;
		else if (s.direction === 'export') exportCount += 1;
		else mixedCount += 1;
	}

	return {
		total: sites.length,
		importCount,
		exportCount,
		mixedCount,
		metaLabel: formatInspectMetaLabel({
			total: sites.length,
			importCount,
			exportCount,
			mixedCount,
		}),
		sites,
	};
}

/** Meta caption: prefers direction counts when focus distinguishes them. */
export function formatInspectMetaLabel(counts: {
	total: number;
	importCount: number;
	exportCount: number;
	mixedCount: number;
}): string {
	const { total, importCount, exportCount, mixedCount } = counts;
	if (total === 0) return '0 observed statements';
	// Single bucket or no directional split yet → legacy wording
	if (
		(importCount === total && exportCount === 0 && mixedCount === 0) ||
		(exportCount === total && importCount === 0 && mixedCount === 0)
	) {
		const noun =
			importCount === total
				? total === 1
					? '1 observed import'
					: `${total} observed imports`
				: total === 1
					? '1 observed export'
					: `${total} observed exports`;
		return `${noun} (relative to selection)`;
	}
	const parts: string[] = [];
	if (importCount) parts.push(`${importCount} import${importCount === 1 ? '' : 's'}`);
	if (exportCount) parts.push(`${exportCount} export${exportCount === 1 ? '' : 's'}`);
	if (mixedCount) parts.push(`${mixedCount} mixed`);
	return `${total} observed · ${parts.join(' · ')} (relative to selection)`;
}

/** Marker chrome for a resolved direction kind (import / export / mixed). */
export function directionMarker(kind: DirectionKind): FormDirectionMarker {
	if (kind === 'export') {
		return {
			direction: 'export',
			label: 'export',
			title: 'Export',
			className: 'atlas-inspect__form-tri atlas-inspect__form-tri--export',
		};
	}
	if (kind === 'mixed') {
		return {
			direction: 'mixed',
			label: 'mixed',
			title: 'Import and export',
			className: 'atlas-inspect__form-tri atlas-inspect__form-tri--mixed',
		};
	}
	return {
		direction: 'import',
		label: 'import',
		title: 'Import',
		className: 'atlas-inspect__form-tri atlas-inspect__form-tri--import',
	};
}

/** Status presentation for direction chrome (color/rotate via host class). */
function directionTriStatus(marker: FormDirectionMarker): StatusPresentation {
	if (marker.direction === 'mixed') {
		// Indeterminate purple dot (solid circle — not PASS triangle).
		return {
			kind: 'incomplete',
			axis: 'indication',
			shape: 'circle',
			variant: 'solid',
			color: 'purple',
			label: marker.label,
			title: marker.title,
		};
	}
	return {
		kind: 'informative',
		axis: 'indication',
		shape: 'triangle',
		variant: 'solid',
		color: 'blue',
		label: marker.label,
		title: marker.title,
	};
}

function createDirectionMarkerEl(
	kind: DirectionKind,
	opts: { showLabel?: boolean; /** Syntax label override (statement form). */ form?: ImportForm } = {},
): HTMLElement {
	// Chrome class follows perspective `kind`; label may keep statement form.
	const chrome = directionMarker(kind);
	const labelSource =
		opts.form !== undefined && kind !== 'mixed'
			? formDirectionMarker(opts.form)
			: chrome;
	const status = directionTriStatus({
		...chrome,
		label: labelSource.label,
		title: labelSource.title,
	});
	const el = createStatusIndicatorEl(status, {
		size: 'xs',
		showLabel: opts.showLabel ?? true,
		className: chrome.className,
	});
	// Atom sets inline --ui-status-color from StatusColorToken.
	// Clear so host classes own blue / cyan / purple.
	el.style.removeProperty('--ui-status-color');
	return el;
}

/**
 * Path-row direction marker (labeled).
 * Chrome = focus-relative direction; label keeps statement `form` when present.
 */
function createFormTriEl(
	form: ImportForm,
	direction?: DirectionKind,
): HTMLElement {
	const dir = direction ?? formDirectionMarker(form).direction;
	return createDirectionMarkerEl(dir, {
		showLabel: true,
		form,
	});
}

function appendCodeBlock(
	parent: HTMLElement,
	pathHtml: string,
	text: string,
	/** Optional leading chrome in the path row (e.g. form direction triangle). */
	pathLead?: HTMLElement,
): void {
	const path = document.createElement('div');
	path.className = 'atlas-inspect__path';
	if (pathLead) path.appendChild(pathLead);
	const rest = document.createElement('span');
	rest.className = 'atlas-inspect__path-text';
	rest.innerHTML = pathHtml;
	path.appendChild(rest);
	const code = document.createElement('pre');
	code.className = 'atlas-inspect__code';
	code.textContent = text;
	parent.append(path, code);
}

/** Header label from precision + provider presence (not hard-coded unavailable). */
function evidenceHeaderLabel(
	precision: LocPrecision,
	surfaceLive: boolean,
	/** True only when Program enrich applied for the current graph (session.programMeta). */
	programApplied = false,
): string {
	if (precision === 'program') {
		if (!programApplied) {
			return 'Import evidence · Program selected (topology not applied; L1 · not LSP)';
		}
		return surfaceLive
			? 'Import evidence · Program topology + export surface (not LSP)'
			: 'Import evidence · Program topology (estimate mass; not LSP)';
	}
	if (precision !== 'exact') return 'Import evidence · estimate (whole file)';
	return surfaceLive
		? 'Import evidence · export surface (not LSP)'
		: 'Import evidence · export surface unavailable';
}

/**
 * Callsite section title from surface-claim precision (not chrome).
 * Program + rehydrated Exact mass remaps to `'exact'` so copy matches surface path.
 */
export function callsitesTitle(
	claimPrecision: LocPrecision,
	surfaceLive: boolean,
): string {
	if (claimPrecision !== 'exact') {
		return 'Possible callsites (estimate — name scan, not type-checked)';
	}
	return surfaceLive
		? 'Callsites (name scan in importer — not type-checked)'
		: 'Callsites (export surface unavailable)';
}

/** Empty callsite note from surface-claim precision + live surface. */
export function emptyCallsitesNote(
	claimPrecision: LocPrecision,
	surfaceLive: boolean,
	blockerMessage?: string,
): string {
	if (blockerMessage) return blockerMessage;
	return surfaceLive && claimPrecision === 'exact'
		? 'No exact callsites found for import bindings.'
		: 'No estimated callsites found for import bindings.';
}

/**
 * Accordion item title text for one import site (path · Lline).
 * Form is shown as the leading direction marker, not in the string.
 * Prefers full path when short; otherwise basename; optional specifier/toLabel;
 * hard-capped ~80 chars.
 */
export function importSiteAccordionTitle(ev: ImportEvidence): string {
	const { path, line, specifier, toLabel } = ev.import;
	const linePart = `L${line}`;
	const full = `${path} · ${linePart}`;
	if (full.length <= ACCORDION_TITLE_MAX) return full;

	const base = path.includes('/')
		? path.slice(path.lastIndexOf('/') + 1)
		: path;
	let title = `${base} · ${linePart}`;
	const extra = specifier || toLabel;
	if (extra) {
		const withExtra = `${title} · ${extra}`;
		if (withExtra.length <= ACCORDION_TITLE_MAX) title = withExtra;
	}
	if (title.length > ACCORDION_TITLE_MAX) {
		return `${title.slice(0, ACCORDION_TITLE_MAX - 1)}…`;
	}
	return title;
}

/** Title slot content: [direction marker] path · Lline */
function createAccordionTitleEl(
	ev: ImportEvidence,
	direction: DirectionKind,
): HTMLElement {
	const host = document.createElement('span');
	host.setAttribute('slot', 'title');
	host.className = 'atlas-inspect__accordion-title';
	// Compact glyph only — path text carries the rest
	host.appendChild(
		createDirectionMarkerEl(direction, {
			showLabel: false,
		}),
	);
	const text = document.createElement('span');
	text.className = 'atlas-inspect__accordion-title-text';
	text.textContent = importSiteAccordionTitle(ev);
	host.appendChild(text);
	return host;
}

/** Import → Imported code → Callsites sections for one evidence row. */
function appendEvidenceSections(
	parent: HTMLElement,
	ev: ImportEvidence,
	claimPrecision: LocPrecision,
	surfaceLive: boolean,
	/** Focus-relative direction for markers (not raw form alone). */
	direction: DirectionKind,
): void {
	// Statement (observed import / export / require / dynamic)
	const impSec = document.createElement('div');
	impSec.className = 'atlas-inspect__section';
	const impH = document.createElement('div');
	impH.className = 'atlas-inspect__section-title';
	impH.textContent = 'Statement';
	impSec.appendChild(impH);
	appendCodeBlock(
		impSec,
		`${escapeHtml(ev.import.path)} <span class="atlas-inspect__line-num">L${ev.import.line}</span>`,
		ev.import.text,
		createFormTriEl(ev.import.form, direction),
	);
	parent.appendChild(impSec);

	// Imported code
	const codeSec = document.createElement('div');
	codeSec.className = 'atlas-inspect__section';
	const codeH = document.createElement('div');
	codeH.className = 'atlas-inspect__section-title';
	codeH.textContent = 'Imported code';
	codeSec.appendChild(codeH);
	if (ev.importedCode) {
		appendCodeBlock(
			codeSec,
			`${escapeHtml(ev.importedCode.path)} <span class="atlas-inspect__line-num">L${ev.importedCode.startLine}–${ev.importedCode.endLine}</span> <span class="atlas-inspect__meta-chip">${escapeHtml(ev.importedCode.note)}</span>`,
			ev.importedCode.text,
			createFormTriEl(ev.import.form, direction),
		);
	} else {
		const note = document.createElement('p');
		note.className = 'atlas-inspect__section-empty';
		const blocker =
			ev.blockers.find((b) => b.code === 'exact-surface-unresolved') ??
			ev.blockers.find((b) => b.code === 'exact-not-implemented') ??
			ev.blockers.find(
				(b) => b.code === 'package-target' || b.code === 'no-source',
			);
		note.textContent =
			blocker?.message ?? 'No imported code excerpt available.';
		codeSec.appendChild(note);
	}
	parent.appendChild(codeSec);

	// Callsites (surface-claim precision — Program+mass remaps to exact)
	const callSec = document.createElement('div');
	callSec.className = 'atlas-inspect__section';
	const callH = document.createElement('div');
	callH.className = 'atlas-inspect__section-title';
	callH.textContent = callsitesTitle(claimPrecision, surfaceLive);
	callSec.appendChild(callH);
	if (ev.callsites.length) {
		for (const cs of ev.callsites) {
			appendCodeBlock(
				callSec,
				`${escapeHtml(cs.path)} <span class="atlas-inspect__line-num">L${cs.line}</span> <span class="atlas-inspect__meta-chip">${escapeHtml(cs.symbol)}</span>`,
				cs.text,
				createFormTriEl(ev.import.form, direction),
			);
		}
	} else {
		const note = document.createElement('p');
		note.className = 'atlas-inspect__section-empty';
		const blocker = ev.blockers.find(
			(b) =>
				b.code === 'exact-not-implemented' ||
				b.code === 'exact-surface-unresolved' ||
				b.code === 'no-bindings',
		);
		note.textContent = emptyCallsitesNote(
			claimPrecision,
			surfaceLive,
			blocker?.message,
		);
		callSec.appendChild(note);
	}
	parent.appendChild(callSec);
}

export function createInspectModals(deps: InspectModalDeps): {
	closeInspectModal: () => void;
	openInspectModal: (
		title: string,
		evidence: ImportEvidence[],
		emptyHint: string,
		/** File id for perspective import/export chrome (optional). */
		focusFileId?: string | null,
	) => void;
	openUnavailableModal: (opts: {
		label?: string;
		heading: string;
		body: string;
	}) => void;
	closeUnavailableModal: () => void;
	inspectNode: (name: string, ref: AlluvialNodeRef) => void;
	inspectBand: (
		sourceName: string | null,
		targetName: string | null,
	) => void;
} {
	function closeInspectModal(): void {
		const modal = $('atlas-inspect-modal') as
			| (HTMLElement & { open?: boolean })
			| null;
		if (modal) modal.open = false;
	}

	/** Carbon alert modal for Level-1-unavailable weight/precision options. */
	function openUnavailableModal(opts: {
		label?: string;
		heading: string;
		body: string;
	}): void {
		const modal = $('atlas-unavailable-modal') as
			| (HTMLElement & { open?: boolean })
			| null;
		const labelEl = $('atlas-unavailable-label');
		const headingEl = $('atlas-unavailable-heading');
		const bodyEl = $('atlas-unavailable-body');
		if (labelEl) labelEl.textContent = opts.label ?? 'Not available';
		if (headingEl) headingEl.textContent = opts.heading;
		if (bodyEl) bodyEl.textContent = opts.body;
		if (modal) modal.open = true;
	}

	function closeUnavailableModal(): void {
		const modal = $('atlas-unavailable-modal') as
			| (HTMLElement & { open?: boolean })
			| null;
		if (modal) modal.open = false;
	}

	function openInspectModal(
		title: string,
		evidence: ImportEvidence[],
		emptyHint: string,
		focusFileId?: string | null,
	): void {
		const modal = $('atlas-inspect-modal') as
			| (HTMLElement & { open?: boolean })
			| null;
		const heading = $('atlas-inspect-heading');
		const label = $('atlas-inspect-label');
		const body = $('atlas-inspect-body');
		if (!modal || !heading || !body) return;

		const chromePrecision = deps.getLocPrecision();
		const claimPrecision =
			deps.getPrecisionForSurfaceClaims?.() ?? chromePrecision;
		const surfaceLive = Boolean(deps.getSurface?.());
		const programApplied = Boolean(deps.getSession()?.programMeta);

		heading.textContent = title;
		if (label) {
			label.textContent = evidenceHeaderLabel(
				chromePrecision,
				surfaceLive,
				programApplied,
			);
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

		const summary = summarizeInspectEvidence(evidence, focusFileId);
		const meta = document.createElement('p');
		meta.className = 'atlas-inspect__meta';
		meta.textContent = summary.metaLabel;
		body.appendChild(meta);

		// Banner only when engine is truly missing (not per-edge unresolved)
		const anyEngineMissing = evidence.some((ev) =>
			ev.blockers.some((b) => b.code === 'exact-not-implemented'),
		);
		if (anyEngineMissing) {
			const banner = document.createElement('cds-inline-notification');
			banner.setAttribute('kind', 'warning');
			banner.setAttribute('title', 'Exact mode');
			banner.setAttribute('subtitle', EXACT_NOT_IMPLEMENTED_MESSAGE);
			banner.setAttribute('low-contrast', '');
			banner.setAttribute('hide-close-button', '');
			banner.classList.add('atlas-inspect__banner');
			body.appendChild(banner);
		}

		const accordion = document.createElement('cds-accordion');
		accordion.classList.add('atlas-inspect-accordion');
		const openFirstOnly = evidence.length === 1;

		for (const ev of evidence) {
			const direction = perspectiveDirectionKind(focusFileId, ev);
			const item = document.createElement('cds-accordion-item');
			// Named title slot (Carbon) so we can lead with a direction marker
			item.appendChild(createAccordionTitleEl(ev, direction));
			// Accessible fallback when slot paint lags / screen readers use attr
			item.setAttribute('title', importSiteAccordionTitle(ev));
			item.dataset.direction = direction;
			item.dataset.form = ev.import.form;
			item.dataset.statementPath = ev.import.path;
			if (openFirstOnly) item.setAttribute('open', '');

			const sections = document.createElement('div');
			sections.className = 'atlas-inspect__sections';
			appendEvidenceSections(
				sections,
				ev,
				claimPrecision,
				surfaceLive,
				direction,
			);
			item.appendChild(sections);
			accordion.appendChild(item);
		}

		body.appendChild(accordion);
		modal.open = true;
	}

	function claimPrecision(): LocPrecision {
		return deps.getPrecisionForSurfaceClaims?.() ?? deps.getLocPrecision();
	}

	function inspectNode(name: string, ref: AlluvialNodeRef): void {
		const session = deps.getSession();
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
		const surface = deps.getSurface?.() ?? null;
		const evidence = evidenceForEdges(
			session.graph,
			edges,
			claimPrecision(),
			surface,
		);
		const focusFileId = ref.kind === 'file' ? ref.id : null;
		openInspectModal(
			name,
			evidence,
			'No observed import lines for this node in the current graph.',
			focusFileId,
		);
	}

	function inspectBand(
		sourceName: string | null,
		targetName: string | null,
	): void {
		const session = deps.getSession();
		if (!session) return;
		const sourceRef = sourceName ? deps.refForName(sourceName) : null;
		const targetRef = targetName ? deps.refForName(targetName) : null;
		const title =
			[sourceName, targetName].filter(Boolean).join(' → ') || 'Band';
		const edges = edgesForBand(session.graph, sourceRef, targetRef);
		const surface = deps.getSurface?.() ?? null;
		const evidence = evidenceForEdges(
			session.graph,
			edges,
			claimPrecision(),
			surface,
		);
		// Prefer file focus when either end is a concrete file
		const focusFileId =
			sourceRef?.kind === 'file'
				? sourceRef.id
				: targetRef?.kind === 'file'
					? targetRef.id
					: null;
		openInspectModal(
			title,
			evidence,
			'No observed import lines for this band (aggregate or unresolved topology).',
			focusFileId,
		);
	}

	return {
		closeInspectModal,
		openInspectModal,
		openUnavailableModal,
		closeUnavailableModal,
		inspectNode,
		inspectBand,
	};
}
