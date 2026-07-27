/**
 * Map Carbon / DOM events → FocusSeed (display names, strip mass, reject rails).
 *
 * Law: .grok/reference/hub-focus-behavior.md
 */

import { isAlluvialRailName } from '@core/view/alluvial.ts';
import {
	seedFromNodeName,
	stripMassSuffix,
	type FocusSeed,
	type LogicalFocusGraph,
} from './logicalFocusGraph.ts';

export { stripMassSuffix };

export function endpointName(end: unknown): string | null {
	if (typeof end === 'string') {
		const s = stripMassSuffix(end.trim());
		return s || null;
	}
	if (end && typeof end === 'object') {
		const o = end as Record<string, unknown>;
		if (typeof o.name === 'string') {
			const s = stripMassSuffix(o.name.trim());
			return s || null;
		}
	}
	return null;
}

export function datumNodeName(raw: unknown): string | null {
	if (typeof raw === 'string') return stripMassSuffix(raw.trim()) || null;
	if (raw && typeof raw === 'object') {
		const o = raw as Record<string, unknown>;
		if (typeof o.name === 'string') {
			return stripMassSuffix(o.name.trim()) || null;
		}
	}
	return null;
}

/**
 * Carbon node hover/click → FocusSeed.
 * Rails → null. Package/unresolved → package. File spine → file-spine.
 */
export function seedFromCarbonNode(
	graph: LogicalFocusGraph,
	datum: unknown,
): FocusSeed | null {
	const name = datumNodeName(datum);
	if (!name || isAlluvialRailName(name)) return null;
	return seedFromNodeName(graph, name);
}

/**
 * Carbon path.link hover → carbon band seed (endpoints only).
 * Rails or missing ends → null.
 */
export function seedFromCarbonLine(datum: unknown): FocusSeed | null {
	const d = datum as {
		source?: unknown;
		target?: unknown;
	} | null;
	if (!d || typeof d !== 'object') return null;
	const sn = endpointName(d.source);
	const tn = endpointName(d.target);
	if (!sn || !tn) return null;
	if (isAlluvialRailName(sn) || isAlluvialRailName(tn)) return null;
	return {
		kind: 'band',
		source: sn,
		target: tn,
		display: 'carbon',
	};
}

/**
 * Straighten path `__data__` → external band seed.
 */
export function seedFromStraightenData(data: unknown): FocusSeed | null {
	const d = data as {
		source?: unknown;
		target?: unknown;
	} | null;
	if (!d || typeof d !== 'object') return null;
	const sn = endpointName(d.source);
	const tn = endpointName(d.target);
	if (!sn || !tn) return null;
	if (isAlluvialRailName(sn) || isAlluvialRailName(tn)) return null;
	return {
		kind: 'band',
		source: sn,
		target: tn,
		display: 'straighten',
	};
}
