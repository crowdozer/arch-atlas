/**
 * File spine highlight, header icon, and export-band recolor.
 */

import { toString } from '@carbon/icon-helpers';
import Document16 from '@carbon/icons/es/document/16.js';
import { CHART_PALETTE } from '@core/view/chartPalette.ts';
import { readData, type SankeyNode } from './sankeyDom.ts';

/** Purple selection accent for File spine — matches --atlas-select-strong. */
const FILE_SPINE_SELECT = CHART_PALETTE.selectStrong;

type IconDescriptor = {
	elem?: string;
	attrs?: Record<string, string | number | undefined>;
	content?: IconDescriptor[];
	name?: string;
	size?: number;
};

let cachedFileIconSvg: string | null = null;
function fileHeaderIconSvg(): string {
	if (!cachedFileIconSvg) {
		cachedFileIconSvg = toString(Document16 as IconDescriptor);
	}
	return cachedFileIconSvg;
}

/**
 * Carbon alluvial paints band strokes from the **source** node color.
 * Export side (right, yellow — packages/files the focus imports) should keep
 * yellow bands when painted from File or another export-side source.
 */
export function isExportSideCategory(category: string): boolean {
	return (
		category === 'Exports' ||
		category === 'Exporters' ||
		category.startsWith('Export hop')
	);
}

export function recolorExportBands(
	holder: HTMLElement,
	colorScale: Record<string, string>,
): void {
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<{
			source?: { name?: string; category?: string };
			target?: { name?: string; category?: string };
		}>(path);
		const target = link?.target;
		if (!target?.name) continue;
		const cat = target.category ?? '';
		if (!isExportSideCategory(cat)) continue;
		const color = colorScale[target.name];
		if (!color) continue;
		// Ribbons paint mass with fill; keep stroke in sync for any residual stroke
		path.style.fill = color;
		path.style.stroke = color;
		path.setAttribute('fill', color);
	}
}

export function isFileCategory(category: string | undefined): boolean {
	return category === 'File';
}

/**
 * Mark File-category node bars and inject a Carbon document icon in place of
 * the "File" column header text (keeps aria-label "File").
 */
export function highlightFileSpine(holder: HTMLElement): void {
	// Node bars + path labels
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<SankeyNode>(el);
		if (!isFileCategory(d?.category)) continue;
		el.classList.add('atlas-alluvial-file-spine');
	}

	// Category headers (Carbon: g.header-arrows > text)
	for (const text of holder.querySelectorAll<SVGTextElement>(
		'g.header-arrows text, .header-arrows text',
	)) {
		const label = (text.textContent ?? '').trim();
		if (label !== 'File') continue;
		text.classList.add('atlas-alluvial-file-header');
		injectFileHeaderIcon(text);
	}
}

/**
 * Replace visible "File" header text with Document-16 icon.
 * Full string stays on aria-label for screen readers.
 */
export function injectFileHeaderIcon(textEl: SVGTextElement): void {
	const parent = textEl.parentElement;
	if (!parent || parent.querySelector('.atlas-alluvial-file-header-icon')) return;

	textEl.setAttribute('aria-label', 'File');
	textEl.setAttribute('aria-hidden', 'true');
	// Keep layout anchor; hide glyphs
	textEl.style.fill = 'transparent';
	textEl.textContent = '';

	const x = Number.parseFloat(textEl.getAttribute('x') ?? '0') || 0;
	const y = Number.parseFloat(textEl.getAttribute('y') ?? '20') || 20;

	const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	wrap.classList.add('atlas-alluvial-file-header-icon');
	wrap.setAttribute('aria-hidden', 'true');
	// Icon is 16×16; center under former text baseline
	wrap.setAttribute('transform', `translate(${x}, ${y - 14})`);

	try {
		const parsed = new DOMParser().parseFromString(fileHeaderIconSvg(), 'image/svg+xml');
		const icon = parsed.documentElement;
		if (icon && icon.tagName.toLowerCase() === 'svg') {
			icon.setAttribute('width', '16');
			icon.setAttribute('height', '16');
			icon.setAttribute('fill', FILE_SPINE_SELECT);
			icon.style.fill = FILE_SPINE_SELECT;
			// Import into current document
			const adopted = document.importNode(icon, true);
			wrap.appendChild(adopted);
			parent.appendChild(wrap);
			return;
		}
	} catch {
		// fall through to path fallback
	}

	// Minimal document glyph if icon parse fails
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute(
		'd',
		'M4 2h6l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm6 1.5V7h3.5',
	);
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', FILE_SPINE_SELECT);
	path.setAttribute('stroke-width', '1.25');
	wrap.appendChild(path);
	parent.appendChild(wrap);
}
