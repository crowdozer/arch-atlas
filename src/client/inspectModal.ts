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
import type { Session } from '@shell/types.ts';
import { $, escapeHtml } from './dom.ts';

export type InspectModalDeps = {
	getLocPrecision: () => LocPrecision;
	getSession: () => Session | null;
	/** Exact surface provider when engines are ready (null under estimate). */
	getSurface?: () => ImportedSurfaceProvider | null;
	/** Resolve alluvial display name → node ref (from current payload). */
	refForName: (name: string) => AlluvialNodeRef | null;
};

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

/** Header label from precision + provider presence (not hard-coded unavailable). */
function evidenceHeaderLabel(
	precision: LocPrecision,
	surfaceLive: boolean,
): string {
	if (precision === 'program') {
		return surfaceLive
			? 'Import evidence · Program topology + export surface (not LSP)'
			: 'Import evidence · Program topology (estimate mass; not LSP)';
	}
	if (precision !== 'exact') return 'Import evidence · estimate (whole file)';
	return surfaceLive
		? 'Import evidence · export surface (not LSP)'
		: 'Import evidence · export surface unavailable';
}

function callsitesTitle(
	precision: LocPrecision,
	surfaceLive: boolean,
): string {
	if (precision !== 'exact') {
		return 'Possible callsites (estimate — name scan, not type-checked)';
	}
	return surfaceLive
		? 'Callsites (name scan in importer — not type-checked)'
		: 'Callsites (export surface unavailable)';
}

export function createInspectModals(deps: InspectModalDeps): {
	closeInspectModal: () => void;
	openInspectModal: (
		title: string,
		evidence: ImportEvidence[],
		emptyHint: string,
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
	): void {
		const modal = $('atlas-inspect-modal') as
			| (HTMLElement & { open?: boolean })
			| null;
		const heading = $('atlas-inspect-heading');
		const label = $('atlas-inspect-label');
		const body = $('atlas-inspect-body');
		if (!modal || !heading || !body) return;

		const locPrecision = deps.getLocPrecision();
		const surfaceLive = Boolean(deps.getSurface?.());

		heading.textContent = title;
		if (label) {
			label.textContent = evidenceHeaderLabel(locPrecision, surfaceLive);
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
					`${escapeHtml(ev.importedCode.path)} <span class="atlas-inspect__line-num">L${ev.importedCode.startLine}–${ev.importedCode.endLine}</span> <span class="atlas-inspect__form">${escapeHtml(ev.importedCode.note)}</span>`,
					ev.importedCode.text,
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
			li.appendChild(codeSec);

			// Callsites
			const callSec = document.createElement('div');
			callSec.className = 'atlas-inspect__section';
			const callH = document.createElement('div');
			callH.className = 'atlas-inspect__section-title';
			callH.textContent = callsitesTitle(locPrecision, surfaceLive);
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
					(b) =>
						b.code === 'exact-not-implemented' ||
						b.code === 'exact-surface-unresolved' ||
						b.code === 'no-bindings',
				);
				note.textContent =
					blocker?.message ??
					(surfaceLive && locPrecision === 'exact'
						? 'No exact callsites found for import bindings.'
						: 'No estimated callsites found for import bindings.');
				callSec.appendChild(note);
			}
			li.appendChild(callSec);

			list.appendChild(li);
		}

		body.appendChild(list);
		modal.open = true;
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
			deps.getLocPrecision(),
			surface,
		);
		openInspectModal(
			name,
			evidence,
			'No observed import lines for this node in the current graph.',
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
			deps.getLocPrecision(),
			surface,
		);
		openInspectModal(
			title,
			evidence,
			'No observed import lines for this band (aggregate or unresolved topology).',
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
