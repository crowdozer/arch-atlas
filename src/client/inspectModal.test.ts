/**
 * Inspect surface-claim precision: Program + rehydrated Exact mass uses exact
 * evidence path and callsite copy (not estimate wording).
 */
import { describe, expect, it } from 'vitest';
import {
	evidenceForEdges,
	indexFiles,
	type LocPrecision,
} from '@core/index.ts';
import { precisionForSurfaceClaims } from '@shell/index.ts';
import {
	callsitesTitle,
	emptyCallsitesNote,
} from './inspectModal.ts';

describe('inspect surface-claim precision (Program + mass)', () => {
	it('remaps program+mass to exact for evidenceForEdges surface branch', () => {
		const { graph } = indexFiles([
			{
				path: 'src/a.ts',
				content: "import { util } from './util.ts';\nutil();\n",
				byteLength: 40,
			},
			{
				path: 'src/util.ts',
				content: 'export function util() { return 1; }\n',
				byteLength: 40,
			},
		]);
		const edge = graph.edges.find(
			(e) => e.from === 'src/a.ts' && e.to.includes('util'),
		);
		expect(edge).toBeDefined();
		if (!edge) return;

		const mock = {
			targetSurfaceMass: () => 1,
			importedSurface: () => ({
				text: 'export function util() { return 1; }',
				note: 'export surface',
				startLine: 1,
				endLine: 1,
			}),
			callSites: () => [
				{
					epistemic: 'inferred' as const,
					path: 'src/a.ts',
					line: 2,
					symbol: 'util',
					text: 'util();',
				},
			],
		};

		// Chrome program + rehydrated mass → claim exact → surface branch
		const claim = precisionForSurfaceClaims('program', true);
		expect(claim).toBe('exact');
		const [evExact] = evidenceForEdges(graph, [edge], claim, mock);
		expect(evExact.precision).toBe('exact');
		expect(evExact.importedCode?.note).toBe('export surface');
		expect(evExact.callsites).toHaveLength(1);

		// Pure program (no mass) → claim estimate → whole-file estimate branch
		const claimPure = precisionForSurfaceClaims('program', false);
		expect(claimPure).toBe('estimate');
		const [evEst] = evidenceForEdges(graph, [edge], claimPure, mock);
		expect(evEst.precision).toBe('estimate');
		// Estimate path ignores provider; whole-file note
		expect(evEst.importedCode).toBeTruthy();
		expect(evEst.importedCode?.note).toMatch(/whole file/i);
	});

	it('callsitesTitle uses exact-surface wording when claim precision is exact + live', () => {
		expect(callsitesTitle('exact', true)).toBe(
			'Callsites (name scan in importer — not type-checked)',
		);
		expect(callsitesTitle('exact', false)).toBe(
			'Callsites (export surface unavailable)',
		);
		// Chrome program without remap would look like estimate — remap first
		const claim = precisionForSurfaceClaims('program', true);
		expect(callsitesTitle(claim, true)).toBe(
			'Callsites (name scan in importer — not type-checked)',
		);
		expect(callsitesTitle('program', true)).toBe(
			'Possible callsites (estimate — name scan, not type-checked)',
		);
		expect(callsitesTitle('estimate', true)).toBe(
			'Possible callsites (estimate — name scan, not type-checked)',
		);
	});

	it('emptyCallsitesNote uses exact wording under remapped program+mass', () => {
		const claim: LocPrecision = precisionForSurfaceClaims('program', true);
		expect(emptyCallsitesNote(claim, true)).toBe(
			'No exact callsites found for import bindings.',
		);
		expect(emptyCallsitesNote('program', true)).toBe(
			'No estimated callsites found for import bindings.',
		);
		expect(emptyCallsitesNote('estimate', false)).toBe(
			'No estimated callsites found for import bindings.',
		);
		expect(emptyCallsitesNote('exact', true, 'blocker wins')).toBe(
			'blocker wins',
		);
	});
});
