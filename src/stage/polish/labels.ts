/**
 * Right-truncate node labels and re-anchor Carbon title chips.
 * Rewrites Carbon's `name (value)` suffix to `(↑|↓flow, loc)`.
 */

import {
	flowBandMass,
	flowTargetBandMass,
	isAlluvialRailName,
	isOverflowNodeName,
	type BandSortMode,
} from '@core/view/alluvial.ts';
import { hideAlluvialRails } from './rails.ts';
import { readData, type SankeyNode } from './sankeyDom.ts';

/** Max visible characters for node name (value suffix kept). Right end wins. */
export const ALLUVIAL_LABEL_MAX_CHARS = 36;

/** Per-node ribbon + LOC stats for label suffix (from payload links + optional loc). */
export type AlluvialLabelStats = {
	/** Max outbound link value (thickest leaving ribbon). */
	maxOut: number;
	/** Max inbound link value (thickest arriving ribbon). */
	maxIn: number;
	/** Whole-file LOC when known; 0 if unknown / non-file. */
	loc: number;
};

export type LabelRewriteOpts = {
	/** Band sort mode — picks which arrow/number is primary. */
	bandSort?: BandSortMode;
	/** name → stats; missing names keep Carbon's original (value). */
	stats?: ReadonlyMap<string, AlluvialLabelStats> | Record<string, AlluvialLabelStats>;
};

/** Compact mass for flow chip (matches Carbon-ish k suffix). */
export function formatAlluvialMassNumber(n: number): string {
	const v = Math.max(0, Math.round(n));
	if (v >= 10_000) return `${Math.round(v / 1000)}k`;
	if (v >= 1000) {
		const k = v / 1000;
		const s = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '');
		return `${s}k`;
	}
	return String(v);
}

/**
 * LOC for chip: exact below 1000; ≥1000 rounds to integer k (`1k`, `12k`).
 */
export function formatAlluvialLocNumber(n: number): string {
	const v = Math.max(0, Math.floor(n));
	if (v >= 1000) return `${Math.round(v / 1000)}k`;
	return String(v);
}

/**
 * Suffix after the path: `(↓50, 120)` or `(↑99, 1k)`.
 * - flow: ↓ maxOut (leaving)
 * - flow-target: ↑ maxIn (arriving)
 * - node / name: arrow of the larger of in/out (tie → leave ↓)
 */
export function formatAlluvialLabelSuffix(
	stats: AlluvialLabelStats,
	mode: BandSortMode = 'name',
): string {
	const maxOut = Math.max(0, stats.maxOut);
	const maxIn = Math.max(0, stats.maxIn);
	const loc = Math.max(0, Math.floor(stats.loc));

	let arrow: '↑' | '↓';
	let flow: number;
	if (mode === 'flow-target') {
		arrow = '↑';
		flow = maxIn;
	} else if (mode === 'flow') {
		arrow = '↓';
		flow = maxOut;
	} else {
		// node / name: show the dominant ribbon direction
		if (maxIn > maxOut) {
			arrow = '↑';
			flow = maxIn;
		} else {
			arrow = '↓';
			flow = maxOut;
		}
	}

	return `(${arrow}${formatAlluvialMassNumber(flow)}, ${formatAlluvialLocNumber(loc)})`;
}

function statsForName(
	name: string,
	stats?: LabelRewriteOpts['stats'],
): AlluvialLabelStats | null {
	if (!stats) return null;
	if (stats instanceof Map) return stats.get(name) ?? null;
	return stats[name] ?? null;
}

/**
 * Build max-in / max-out / loc maps for label polish from payload links + loc map.
 */
export function buildAlluvialLabelStats(
	links: readonly { source: string; target: string; value: number }[],
	locByName?: ReadonlyMap<string, number> | Record<string, number> | null,
): Map<string, AlluvialLabelStats> {
	const maxOut = flowBandMass(links);
	const maxIn = flowTargetBandMass(links);
	const names = new Set<string>([...maxOut.keys(), ...maxIn.keys()]);
	if (locByName) {
		if (locByName instanceof Map) {
			for (const k of locByName.keys()) names.add(k);
		} else {
			for (const k of Object.keys(locByName)) names.add(k);
		}
	}
	const out = new Map<string, AlluvialLabelStats>();
	for (const name of names) {
		if (isAlluvialRailName(name) || isOverflowNodeName(name)) continue;
		let loc = 0;
		if (locByName instanceof Map) loc = locByName.get(name) ?? 0;
		else if (locByName) loc = locByName[name] ?? 0;
		out.set(name, {
			maxOut: maxOut.get(name) ?? 0,
			maxIn: maxIn.get(name) ?? 0,
			loc,
		});
	}
	return out;
}

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
 * Carbon paints `name (value)`. Truncate only the name; rewrite the value suffix
 * to `(↑|↓flow, loc)` when stats are provided. Full original on title/aria.
 *
 * Also undraws rails/pad scaffolds **without** construction pairs (pairs
 * undraw is applied later from the polish facade with meta pairs).
 */
export function rightTruncateAlluvialLabels(
	holder: HTMLElement,
	maxChars: number = ALLUVIAL_LABEL_MAX_CHARS,
	opts?: LabelRewriteOpts,
): void {
	hideAlluvialRails(holder);
	const mode = opts?.bandSort ?? 'name';

	for (const text of holder.querySelectorAll<SVGTextElement>('text.node-text')) {
		const full = text.textContent ?? '';
		if (!full) continue;
		// Match "label (value)" — value may be "1.2k" etc.
		const m = full.match(/^(.*) \(([^()]*)\)$/);
		const name = m ? m[1]! : full;
		const carbonValue = m ? m[2]! : null;

		if (isAlluvialRailName(name)) {
			text.textContent = '';
			continue;
		}

		const truncName = rightTruncateLabel(name, maxChars);
		const stats = statsForName(name, opts?.stats);
		let suffix: string | null = null;
		if (stats && !isOverflowNodeName(name)) {
			suffix = formatAlluvialLabelSuffix(stats, mode);
		} else if (carbonValue !== null) {
			suffix = `(${carbonValue})`;
		}

		const next = suffix !== null ? `${truncName} ${suffix}` : truncName;
		const hover =
			stats && suffix ? `${name} ${suffix}` : name;
		if (next === full) {
			if (!text.getAttribute('title')) text.setAttribute('title', hover);
			continue;
		}
		text.textContent = next;
		text.setAttribute('title', hover);
		text.setAttribute('aria-label', stats && suffix ? hover : full);
		// Carbon laid out with full string width — re-anchor chip to the bar
		// with the truncated measure (bg width + title-group transform).
		repositionAlluvialLabelChip(text);
	}
}
