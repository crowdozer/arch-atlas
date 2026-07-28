/**
 * Right-truncate node labels and re-anchor Carbon title chips.
 */

import { isAlluvialRailName } from '@core/view/alluvial.ts';
import { hideAlluvialRails } from './rails.ts';
import { readData, type SankeyNode } from './sankeyDom.ts';

/** Max visible characters for node name (value suffix kept). Right end wins. */
export const ALLUVIAL_LABEL_MAX_CHARS = 36;

/**
 * Keep the right end of a label (paths show basename side); prefix ellipsis.
 * Pure string helper — used for SVG text polish after Carbon paints full names.
 */
export function rightTruncateLabel(text: string, maxChars: number): string {
	const max = Math.max(2, Math.floor(maxChars));
	if (text.length <= max) return text;
	return `…${text.slice(-(max - 1))}`;
}

/**
 * Carbon alluvial title-group `translate(x,y)` relative to the node-group origin.
 *
 * Mirrors `@carbon/charts` alluvial paint:
 * - vertical: bar mid minus half of the 18px chip
 * - horizontal: hang left of the bar when `node.x1 >= textWidth`, else sit just
 *   right of the bar (`barWidth + 4`)
 *
 * Call with the **visible** text width after any truncation so the chip stays
 * snug to the bar (Carbon lays out with the full string first).
 */
export function carbonAlluvialLabelTitleOffset(
	node: { x0: number; x1: number; y0: number; y1: number },
	textWidth: number,
): { x: number; y: number } {
	const barW = node.x1 - node.x0;
	const barH = node.y1 - node.y0;
	const y = barH / 2 - 9;
	if (node.x1 >= textWidth) {
		return { x: barW - (textWidth + 16), y };
	}
	return { x: barW + 4, y };
}

/**
 * After label text changes, resize the chip bg and re-apply Carbon’s title
 * transform so truncated chips do not float away from the bar.
 */
function repositionAlluvialLabelChip(textEl: SVGTextElement): void {
	const titleG = textEl.parentElement as SVGGElement | null;
	if (!titleG) return;

	const nodeG =
		(typeof textEl.closest === 'function'
			? textEl.closest('g.node-group')
			: null) ??
		(titleG.classList?.contains('node-group')
			? titleG
			: (titleG.parentElement as SVGGElement | null));
	if (!nodeG) return;

	const d = readData<SankeyNode>(nodeG);
	if (
		!d ||
		typeof d.x0 !== 'number' ||
		typeof d.x1 !== 'number' ||
		typeof d.y0 !== 'number' ||
		typeof d.y1 !== 'number'
	) {
		return;
	}

	let textW = 0;
	try {
		if (typeof textEl.getComputedTextLength === 'function') {
			textW = textEl.getComputedTextLength();
		}
	} catch {
		return;
	}
	if (!(textW > 0)) return;

	const bg =
		titleG.querySelector?.<SVGRectElement>('rect.node-text-bg') ??
		nodeG.querySelector?.<SVGRectElement>('rect.node-text-bg') ??
		null;
	if (bg) {
		bg.setAttribute('width', String(Math.ceil(textW + 8)));
	}

	// Carbon wraps text+bg in g[alluvial-node-title-*]; fixtures may put text
	// directly under node-group — only re-transform a distinct title wrapper.
	if (titleG !== nodeG) {
		const { x, y } = carbonAlluvialLabelTitleOffset(d, textW);
		titleG.setAttribute('transform', `translate(${x}, ${y})`);
	}
}

/**
 * Carbon paints `name (value)`. Truncate only the name; keep the mass suffix.
 * Full original string goes on title + aria-label for hover/a11y.
 *
 * Also undraws rails/pad scaffolds **without** construction pairs (pairs
 * undraw is applied later from the polish facade with meta pairs).
 */
export function rightTruncateAlluvialLabels(
	holder: HTMLElement,
	maxChars: number = ALLUVIAL_LABEL_MAX_CHARS,
): void {
	hideAlluvialRails(holder);

	for (const text of holder.querySelectorAll<SVGTextElement>('text.node-text')) {
		const full = text.textContent ?? '';
		if (!full) continue;
		// Match "label (value)" — value may be "1.2k" etc.
		const m = full.match(/^(.*) \(([^()]*)\)$/);
		const name = m ? m[1]! : full;
		const value = m ? m[2]! : null;

		if (isAlluvialRailName(name)) {
			text.textContent = '';
			continue;
		}

		const truncName = rightTruncateLabel(name, maxChars);
		if (truncName === name) {
			// Still expose full name for hover when already short
			if (!text.getAttribute('title')) text.setAttribute('title', name);
			continue;
		}
		const next = value !== null ? `${truncName} (${value})` : truncName;
		text.textContent = next;
		text.setAttribute('title', name);
		text.setAttribute('aria-label', full);
		// Carbon laid out with full string width — re-anchor chip to the bar
		// with the truncated measure (bg width + title-group transform).
		repositionAlluvialLabelChip(text);
	}
}
