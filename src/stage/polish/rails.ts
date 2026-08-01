/**
 * Hide pad-rail nodes and undraw import pad / pair-covered scaffold links.
 */

import {
	isAlluvialRailName,
	isImportPadScaffoldLink,
	isInRailName,
} from '@core/view/alluvial.ts';
import {
	isExternalStraightPairLink,
	type ExternalStraightPair,
} from './externalStraighten.ts';
import { readData } from './sankeyDom.ts';

/** Prefer {@link isInRailName} - import free-source pad labels. */
export function isImportRailLabel(name: string): boolean {
	return isInRailName(name);
}

/**
 * Hide pad-rail **nodes** (in-rail and out-rail bars/chips).
 * Undraw import pad scaffolds: pure in-rail↔in-rail and External package hops
 * (parent→in-rail→External). When `pairs` is non-empty, also undraw any Carbon
 * link whose ends match a construction pair (including **direct** parent→package
 * attaches that skip rails) so straighten can paint once.
 * Export File→out-rail→deep-target ribbons stay painted.
 * Tooltips still scrub rail names via {@link alluvialTooltipCustomHTML}.
 * Pair with {@link straightenExternalPackageBands} for straight External bands.
 */
export function hideAlluvialRails(
	holder: HTMLElement,
	opts?: { pairs?: readonly Pick<ExternalStraightPair, 'parent' | 'packageName'>[] },
): void {
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<{ name?: string }>(el);
		const fromData = typeof d?.name === 'string' ? d.name : '';
		const textEl = el.querySelector<SVGTextElement>('text.node-text');
		const fromText = textEl?.textContent ?? '';
		if (!isAlluvialRailName(fromData) && !isAlluvialRailName(fromText)) {
			continue;
		}
		el.classList.add('atlas-alluvial-rail');
		el.setAttribute('aria-hidden', 'true');
		el.setAttribute('pointer-events', 'none');
		el.removeAttribute('title');
		for (const t of el.querySelectorAll('title')) t.remove();
		if (textEl) {
			textEl.textContent = '';
			textEl.removeAttribute('title');
			textEl.removeAttribute('aria-label');
			textEl.setAttribute('aria-hidden', 'true');
		}
		const bg = el.querySelector<SVGRectElement>('rect.node-text-bg');
		if (bg) {
			bg.setAttribute('width', '0');
			bg.setAttribute('height', '0');
			bg.setAttribute('opacity', '0');
		}
		const bar = el.querySelector<SVGRectElement>('rect.node');
		if (bar) {
			bar.setAttribute('width', '0');
			bar.setAttribute('opacity', '0');
		}
		const titleG = el.querySelector<SVGGElement>('g[id*="alluvial-node-title"]');
		if (titleG) {
			titleG.style.display = 'none';
			titleG.setAttribute('pointer-events', 'none');
		}
	}

	const pairs = opts?.pairs;
	const usePairs = Boolean(pairs?.length);

	// Import pad scaffold + External package hop pads (parent→in-rail→External).
	// When pairs present: also undraw direct pair-covered parent→package Carbon links.
	// Export out-rail mass carriers stay painted (unless pair-covered, which they aren't).
	for (const path of holder.querySelectorAll<SVGPathElement>('path.link')) {
		const link = readData<{
			source?: { name?: string; category?: string } | string;
			target?: { name?: string; category?: string } | string;
		}>(path);
		const sn =
			typeof link?.source === 'string'
				? link.source
				: (link?.source?.name ?? '');
		const tn =
			typeof link?.target === 'string'
				? link.target
				: (link?.target?.name ?? '');
		const sc =
			typeof link?.source === 'object' && link?.source
				? link.source.category
				: undefined;
		const tc =
			typeof link?.target === 'object' && link?.target
				? link.target.category
				: undefined;
		const scaffold = isImportPadScaffoldLink(sn, tn, {
			sourceCategory: sc,
			targetCategory: tc,
		});
		const pairCovered =
			usePairs && isExternalStraightPairLink(sn, tn, pairs!);
		if (!scaffold && !pairCovered) {
			continue;
		}
		path.classList.add('atlas-alluvial-pad-band');
		path.setAttribute('pointer-events', 'none');
		if (isInRailName(sn) && isInRailName(tn)) {
			path.classList.add('atlas-alluvial-rail-link');
		}
		if (isInRailName(sn) || isInRailName(tn) || pairCovered) {
			path.classList.add('atlas-alluvial-external-pad');
		}
	}
}
