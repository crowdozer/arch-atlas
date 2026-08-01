/**
 * Import/export terminator chrome on hub alluvial nodes.
 */

import { isAlluvialRailName } from '@core/view/alluvial.ts';
import { readData } from './sankeyDom.ts';

/**
 * Mark reverse free-source pad targets (Exports* free sources, left).
 * CSS: **cyan** wrap - contrast on yellow export columns (not yellow-on-yellow).
 * Does not override File purple spine.
 */
export function markAlluvialTerminators(
	holder: HTMLElement,
	terminators: readonly string[] | undefined,
): void {
	if (!terminators?.length) return;
	const set = new Set(terminators);
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<{ name?: string }>(el);
		const name = typeof d?.name === 'string' ? d.name : '';
		if (!name || !set.has(name)) continue;
		// Never treat rails as terminators; never fight File spine
		if (isAlluvialRailName(name)) continue;
		const cat = (d as { category?: string }).category;
		if (cat === 'File') continue;
		// Cyan class (historical "export-terminator" name = cyan chrome)
		el.classList.add('atlas-alluvial-export-terminator');
	}
}

/**
 * Mark forward true leaves (Imports* / External).
 * - File leaves on Imports*: **yellow** wrap (contrast on cyan columns)
 * - Packages / unresolved / External buckets: **purple** wrap (unique package
 *   chrome; future icon affordance can target the same class)
 */
export function markAlluvialExportTerminators(
	holder: HTMLElement,
	exportTerminators: readonly string[] | undefined,
): void {
	if (!exportTerminators?.length) return;
	const set = new Set(exportTerminators);
	for (const el of holder.querySelectorAll<SVGGElement>('g.node-group')) {
		const d = readData<{ name?: string; category?: string }>(el);
		const name = typeof d?.name === 'string' ? d.name : '';
		if (!name || !set.has(name)) continue;
		if (isAlluvialRailName(name)) continue;
		const cat = d?.category;
		if (cat === 'File') continue;
		// External column = package / unresolved / package buckets
		if (cat === 'External') {
			el.classList.add('atlas-alluvial-package-terminator');
		} else {
			el.classList.add('atlas-alluvial-terminator');
		}
	}
}
