/**
 * Apply FocusPlan to a polished alluvial holder (DOM or MiniEl).
 *
 * Every drawn band becomes focus or dim. Pad-bands are never focused.
 * Clears Carbon inline opacity so CSS under .ui-alluvial-label-dimming wins.
 *
 * Law: .grok/reference/hub-focus-behavior.md §5
 */

import type { DrawnInventory } from './displayInventory.ts';
import {
	externalBandKey,
	fileBandKey,
	nameInFocus,
	type FocusPlan,
	type FocusNodeRef,
} from './logicalFocusGraph.ts';

export const CLASS_DIMMING = 'ui-alluvial-label-dimming';
export const CLASS_LABEL_FOCUS = 'ui-alluvial-label-focus';
export const CLASS_CARBON_FOCUS = 'atlas-alluvial-carbon-link-focus';
export const CLASS_CARBON_DIM = 'atlas-alluvial-carbon-link-dim';
export const CLASS_STRAIGHT_FOCUS = 'atlas-alluvial-external-straight--focus';
export const CLASS_PAD_BAND = 'atlas-alluvial-pad-band';
export const CLASS_DRILL = 'atlas-alluvial-drill-target';

type MiniLike = {
	classList: {
		add: (...t: string[]) => void;
		remove: (...t: string[]) => void;
		contains: (t: string) => boolean;
		toggle?: (t: string, force?: boolean) => void;
	};
	querySelectorAll: (sel: string) => Iterable<MiniPath | MiniGroup>;
	querySelector?: (sel: string) => MiniPath | MiniGroup | null;
};

type MiniPath = {
	classList: {
		add: (...t: string[]) => void;
		remove: (...t: string[]) => void;
		contains: (t: string) => boolean;
		toggle: (t: string, force?: boolean) => void;
	};
	style?: {
		removeProperty?: (p: string) => void;
		strokeOpacity?: string;
		fillOpacity?: string;
		opacity?: string;
	};
	__data__?: unknown;
	dataset?: Record<string, string>;
};

type MiniGroup = MiniPath & {
	querySelector?: (sel: string) => MiniPath | null;
};

function toggleClass(
	el: { classList: { add: (...t: string[]) => void; remove: (...t: string[]) => void; toggle?: (t: string, force?: boolean) => void } },
	token: string,
	on: boolean,
): void {
	if (typeof el.classList.toggle === 'function') {
		el.classList.toggle(token, on);
		return;
	}
	if (on) el.classList.add(token);
	else el.classList.remove(token);
}

function endName(end: unknown): string {
	if (typeof end === 'string') return end;
	if (end && typeof end === 'object' && 'name' in end) {
		const n = (end as { name?: string }).name;
		return typeof n === 'string' ? n : '';
	}
	return '';
}

function nodeNameFromGroup(g: MiniGroup): string | null {
	const d = g.__data__ as { name?: string } | undefined;
	if (d && typeof d.name === 'string' && d.name) return d.name;
	const textEl = g.querySelector?.('text.node-text') as
		| { textContent?: string }
		| null
		| undefined;
	const raw = textEl?.textContent?.trim() ?? '';
	if (!raw) return null;
	return raw.replace(/\s+\([\d,.]+\)$/u, '');
}

export type ApplyFocusOpts = {
	/** Optional inventory; when omitted, classify from live DOM paths. */
	inventory?: DrawnInventory;
	nodeRef?: Record<string, FocusNodeRef>;
	/** Drill chip target (display name). */
	drillTarget?: string | null;
};

/**
 * Apply plan: dimming holder class, label focus, every non-pad band focus|dim.
 */
export function applyFocusPlan(
	holder: MiniLike | HTMLElement,
	plan: FocusPlan,
	opts: ApplyFocusOpts = {},
): void {
	const h = holder as MiniLike;
	h.classList.add(CLASS_DIMMING);

	const active = plan.activeLabels;
	const focused = plan.focusedBandKeys;
	const nodeRef = opts.nodeRef;
	const drill = opts.drillTarget ?? plan.drillTarget;

	for (const g of h.querySelectorAll('g.node-group') as Iterable<MiniGroup>) {
		const title = g.querySelector?.('g[id*="alluvial-node-title"]') as
			| MiniPath
			| null
			| undefined;
		if (title?.style?.display === 'none') continue;
		const name = nodeNameFromGroup(g);
		const on = name != null && nameInFocus(name, active, nodeRef);
		toggleClass(g, CLASS_LABEL_FOCUS, on);
		toggleClass(g, CLASS_DRILL, drill != null && name === drill);
		title?.style?.removeProperty?.('opacity');
	}

	// Prefer inventory keys; still walk DOM so every path gets a class.
	for (const p of h.querySelectorAll('path.link') as Iterable<MiniPath>) {
		if (p.classList.contains(CLASS_PAD_BAND)) {
			// Pad never focus/dim for product apply
			p.classList.remove(CLASS_CARBON_FOCUS, CLASS_CARBON_DIM, CLASS_STRAIGHT_FOCUS);
			continue;
		}
		const isStraight = p.classList.contains('atlas-alluvial-external-straight');
		const d = p.__data__ as { source?: unknown; target?: unknown } | undefined;
		const sn = endName(d?.source);
		const tn = endName(d?.target);
		const key = isStraight
			? externalBandKey(sn, tn)
			: fileBandKey(sn, tn);
		const on = sn !== '' && tn !== '' && focused.has(key);

		// Clear inline opacity so CSS fill-opacity / stroke-opacity under dimming win
		p.style?.removeProperty?.('stroke-opacity');
		p.style?.removeProperty?.('fill-opacity');
		p.style?.removeProperty?.('opacity');

		if (isStraight) {
			toggleClass(p, CLASS_STRAIGHT_FOCUS, on);
			// Straighten does not use carbon-link-* classes
			p.classList.remove(CLASS_CARBON_FOCUS, CLASS_CARBON_DIM);
		} else {
			toggleClass(p, CLASS_CARBON_FOCUS, on);
			toggleClass(p, CLASS_CARBON_DIM, !on);
			p.classList.remove(CLASS_STRAIGHT_FOCUS);
		}
	}

	// Straighten paths may also be selected without path.link class in some DOM
	for (const p of h.querySelectorAll(
		'path.atlas-alluvial-external-straight',
	) as Iterable<MiniPath>) {
		const d = p.__data__ as { source?: unknown; target?: unknown } | undefined;
		const sn = endName(d?.source);
		const tn = endName(d?.target);
		const key = externalBandKey(sn, tn);
		const on = sn !== '' && tn !== '' && focused.has(key);
		p.style?.removeProperty?.('stroke-opacity');
		p.style?.removeProperty?.('fill-opacity');
		p.style?.removeProperty?.('opacity');
		toggleClass(p, CLASS_STRAIGHT_FOCUS, on);
	}
}

/** Remove dimming + focus/dim classes; restore neutral chart state. */
export function clearFocusPlan(holder: MiniLike | HTMLElement): void {
	const h = holder as MiniLike;
	h.classList.remove(CLASS_DIMMING);
	// legacy package blanket - never leave behind
	h.classList.remove('ui-alluvial-external-pkg-focus');

	for (const g of h.querySelectorAll('g.node-group') as Iterable<MiniGroup>) {
		g.classList.remove(CLASS_LABEL_FOCUS, CLASS_DRILL);
		const title = g.querySelector?.('g[id*="alluvial-node-title"]') as
			| MiniPath
			| null
			| undefined;
		title?.style?.removeProperty?.('opacity');
	}

	for (const p of h.querySelectorAll('path.link') as Iterable<MiniPath>) {
		p.classList.remove(
			CLASS_CARBON_FOCUS,
			CLASS_CARBON_DIM,
			CLASS_STRAIGHT_FOCUS,
		);
		p.style?.removeProperty?.('stroke-opacity');
		p.style?.removeProperty?.('fill-opacity');
		p.style?.removeProperty?.('opacity');
	}
	for (const p of h.querySelectorAll(
		'path.atlas-alluvial-external-straight',
	) as Iterable<MiniPath>) {
		p.classList.remove(CLASS_STRAIGHT_FOCUS);
		p.style?.removeProperty?.('stroke-opacity');
		p.style?.removeProperty?.('fill-opacity');
		p.style?.removeProperty?.('opacity');
	}
}

/**
 * Classify each drawn inventory band under a plan (pure observability helper).
 */
export function classifyDrawnBands(
	plan: FocusPlan,
	inventory: DrawnInventory,
): Map<string, 'focus' | 'dim'> {
	const out = new Map<string, 'focus' | 'dim'>();
	for (const b of inventory.bands) {
		out.set(b.key, plan.focusedBandKeys.has(b.key) ? 'focus' : 'dim');
	}
	return out;
}
