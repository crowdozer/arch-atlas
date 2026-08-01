/**
 * Drawn-band inventory for hub focus apply.
 * Lists every focusable band after polish (or simulated from payload + pairs).
 *
 * Law: .grok/reference/hub-focus-behavior.md §4
 */

import {
	isAlluvialRailName,
	isImportPadScaffoldLink,
} from '@core/view/alluvial.ts';
import type { AlluvialPayload } from '@core/graph/types.ts';
import {
	isExternalStraightPairLink,
	type ExternalStraightPair,
} from '../polish/index.ts';
import {
	externalBandKey,
	fileBandKey,
	type FocusLink,
} from './logicalFocusGraph.ts';

export type DrawnBandKind = 'carbon' | 'straighten';

export type DrawnBand = {
	key: string;
	source: string;
	target: string;
	kind: DrawnBandKind;
};

export type DrawnInventory = {
	bands: readonly DrawnBand[];
	byKey: ReadonlyMap<string, DrawnBand>;
};

/**
 * Simulate post-polish drawn bands from payload + pairs (no DOM).
 * - carbon: non-rail, non-pad-scaffold, not pair-covered External attaches
 * - straighten: every externalStraightPairs entry
 */
export function listDrawnBandsFromPayload(
	payload: Pick<AlluvialPayload, 'data' | 'meta' | 'options'>,
): DrawnInventory {
	const pairs = payload.meta.externalStraightPairs ?? [];
	const nodes = payload.options?.alluvial?.nodes ?? [];
	const catByName = new Map(nodes.map((n) => [n.name, n.category]));

	const bands: DrawnBand[] = [];
	const seen = new Set<string>();

	for (const l of payload.data) {
		const sn = l.source;
		const tn = l.target;
		if (!sn || !tn) continue;
		if (isAlluvialRailName(sn) || isAlluvialRailName(tn)) continue;
		const scaffold = isImportPadScaffoldLink(sn, tn, {
			sourceCategory: catByName.get(sn),
			targetCategory: catByName.get(tn),
		});
		if (scaffold) continue;
		if (pairs.length && isExternalStraightPairLink(sn, tn, pairs)) continue;
		// Skip package endpoints that somehow remain (pair-covered already handled)
		const tk = payload.meta.nodeRef[tn]?.kind;
		const sk = payload.meta.nodeRef[sn]?.kind;
		if (
			tk === 'package' ||
			tk === 'unresolved' ||
			sk === 'package' ||
			sk === 'unresolved'
		) {
			// Residual non-pair package hop would be undrawn scaffold or error -
			// not a drawn focus target.
			continue;
		}
		const key = fileBandKey(sn, tn);
		if (seen.has(key)) continue;
		seen.add(key);
		bands.push({ key, source: sn, target: tn, kind: 'carbon' });
	}

	for (const p of pairs) {
		const key = externalBandKey(p.parent, p.packageName);
		if (seen.has(key)) continue;
		seen.add(key);
		bands.push({
			key,
			source: p.parent,
			target: p.packageName,
			kind: 'straighten',
		});
	}

	return {
		bands,
		byKey: new Map(bands.map((b) => [b.key, b])),
	};
}

/**
 * Read drawn bands from a polished holder DOM (MiniEl-compatible).
 * Carbon: path.link without pad-band / external-straight.
 * Straighten: path.atlas-alluvial-external-straight.
 */
export function listDrawnBandsFromHolder(holder: {
	querySelectorAll: (sel: string) => Iterable<{
		classList: { contains: (t: string) => boolean };
		__data__?: unknown;
	}>;
}): DrawnInventory {
	const bands: DrawnBand[] = [];
	const seen = new Set<string>();

	const endName = (end: unknown): string => {
		if (typeof end === 'string') return end;
		if (end && typeof end === 'object' && 'name' in end) {
			const n = (end as { name?: string }).name;
			return typeof n === 'string' ? n : '';
		}
		return '';
	};

	for (const p of holder.querySelectorAll('path.link')) {
		if (p.classList.contains('atlas-alluvial-pad-band')) continue;
		if (p.classList.contains('atlas-alluvial-external-straight')) continue;
		const d = p.__data__ as
			| { source?: unknown; target?: unknown }
			| undefined;
		const sn = endName(d?.source);
		const tn = endName(d?.target);
		if (!sn || !tn) continue;
		if (isAlluvialRailName(sn) || isAlluvialRailName(tn)) continue;
		const key = fileBandKey(sn, tn);
		if (seen.has(key)) continue;
		seen.add(key);
		bands.push({ key, source: sn, target: tn, kind: 'carbon' });
	}

	for (const p of holder.querySelectorAll(
		'path.atlas-alluvial-external-straight',
	)) {
		const d = p.__data__ as
			| { source?: unknown; target?: unknown }
			| undefined;
		const sn = endName(d?.source);
		const tn = endName(d?.target);
		if (!sn || !tn) continue;
		const key = externalBandKey(sn, tn);
		if (seen.has(key)) continue;
		seen.add(key);
		bands.push({ key, source: sn, target: tn, kind: 'straighten' });
	}

	return {
		bands,
		byKey: new Map(bands.map((b) => [b.key, b])),
	};
}

export type { ExternalStraightPair, FocusLink };
