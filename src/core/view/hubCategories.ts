/**
 * Hub alluvial category / rail / display helpers.
 *
 * Product law (columns L→R):
 *   Export hop N … → Exports → File → Imports → Import hop N → External
 *
 * Naming trap (do not casual-rename ring helpers in sibling modules):
 * - `addImportRings` builds **Exports*** (reverse importers)
 * - `addExportRings` builds **Imports*** (forward file deps)
 * See `.grok/reference/hub-alluvial-behavior.md` and field notes E1.
 */

import { TEAL } from '@core/view/alluvial.ts';

/**
 * Outer import-side column for pure external package/unresolved leaves
 * (node_modules / unresolved). One rail depth beyond file Import hops.
 */
export const EXTERNAL_IMPORT_CATEGORY = 'External';

/** dist-1 keeps Imports/Exports; outer rings are Import hop k / Export hop k. */
export function importHopCategory(dist: number): string {
	return dist <= 1 ? 'Imports' : `Import hop ${dist}`;
}

export function exportHopCategory(dist: number): string {
	return dist <= 1 ? 'Exports' : `Export hop ${dist}`;
}

/** True for Imports, Import hop N, or External package rail. */
export function isImportSideCategory(category: string): boolean {
	return (
		category === 'Imports' ||
		category === EXTERNAL_IMPORT_CATEGORY ||
		category.startsWith('Import hop')
	);
}

/** Shared invisible rail for reverse-path padding at import hop stage s (s≥2). */
export function importRailId(stage: number): string {
	return `\u200b·in-rail·h${stage}`;
}

/** Shared invisible rail for File→deep export padding (stage = hop column index). */
export function exportRailId(stage: number): string {
	return `\u200b·out-rail·h${stage}`;
}

/**
 * Normalize legacy display tags. Build already uses Imports/Import hop (left)
 * and Exports/Export hop (right).
 */
export function displayHubCategory(category: string): string {
	if (category === 'Exporters') return 'Exports';
	if (category === 'Importers') return 'Imports';
	if (category.startsWith('Importer hop ')) {
		return category.replace(/^Importer hop /, 'Import hop ');
	}
	return category;
}

/** Cyan hop gradient (Imports / left) — closer to File is brighter. */
export function importHopColor(dist: number, maxDist: number): string {
	const t = dist / Math.max(maxDist, 1);
	if (t > 0.75) return '#0e7490'; // cyan-700
	if (t > 0.5) return '#0891b2'; // cyan-600
	if (t > 0.25) return '#06b6d4'; // cyan-500
	return '#22d3ee'; // cyan-400
}

/** Yellow hop gradient (Exports / right) — closer to File is brighter. */
export function exportHopColor(dist: number, maxDist: number): string {
	const t = dist / Math.max(maxDist, 1);
	if (t > 0.75) return TEAL.exportOther;
	if (t > 0.5) return TEAL.exportPkg;
	return TEAL.export;
}
