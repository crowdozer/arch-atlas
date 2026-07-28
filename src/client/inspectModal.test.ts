/**
 * Inspect surface-claim precision: Program + rehydrated Exact mass uses exact
 * evidence path and callsite copy (not estimate wording).
 * Accordion title + form direction markers are pure helpers.
 */
import { describe, expect, it } from 'vitest';
import {
	evidenceForEdges,
	indexFiles,
	type ImportEvidence,
	type LocPrecision,
} from '@core/index.ts';
import { precisionForSurfaceClaims } from '@shell/index.ts';
import {
	callsitesTitle,
	emptyCallsitesNote,
	formDirectionMarker,
	importSiteAccordionTitle,
} from './inspectModal.ts';

function sampleEvidence(
	overrides: Partial<ImportEvidence['import']> = {},
): ImportEvidence {
	return {
		precision: 'estimate',
		edgeId: 'e1',
		import: {
			path: 'src/client/app.ts',
			line: 42,
			text: "import { x } from './x';",
			form: 'import',
			specifier: './x',
			toLabel: 'x',
			...overrides,
		},
		callsites: [],
		blockers: [],
	};
}

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

describe('importSiteAccordionTitle', () => {
	it('uses full path · Lline · form when short enough', () => {
		expect(importSiteAccordionTitle(sampleEvidence())).toBe(
			'src/client/app.ts · L42 · import',
		);
	});

	it('falls back to basename when full path is long', () => {
		const longPath =
			'src/very/deeply/nested/path/that/makes/the/full/title/too/long/for/the/cap/module.ts';
		const title = importSiteAccordionTitle(
			sampleEvidence({ path: longPath, line: 7, form: 'require' }),
		);
		expect(title.startsWith('module.ts · L7 · require')).toBe(true);
		expect(title.length).toBeLessThanOrEqual(80);
		expect(title).not.toContain('very/deeply');
	});

	it('keeps full path without specifier when path · Lline · form fits under the cap', () => {
		const title = importSiteAccordionTitle(
			sampleEvidence({
				path: 'src/deep/nested/importer.ts',
				line: 3,
				form: 'import',
				specifier: './helpers',
			}),
		);
		expect(title).toBe('src/deep/nested/importer.ts · L3 · import');
	});

	it('includes specifier on basename fallback when it fits', () => {
		const longPath =
			'packages/workspace/packages/client/src/features/inspect/deep/nested/importer.ts';
		const title = importSiteAccordionTitle(
			sampleEvidence({
				path: longPath,
				line: 9,
				form: 'import',
				specifier: './util',
				toLabel: 'util',
			}),
		);
		expect(title).toBe('importer.ts · L9 · import · ./util');
		expect(title.length).toBeLessThanOrEqual(80);
	});

	it('hard-truncates with ellipsis when still over max', () => {
		const title = importSiteAccordionTitle(
			sampleEvidence({
				path: 'x'.repeat(100) + '.ts',
				line: 1,
				form: 'import',
				specifier: 'y'.repeat(50),
				toLabel: '',
			}),
		);
		expect(title.length).toBe(80);
		expect(title.endsWith('…')).toBe(true);
	});
});

describe('formDirectionMarker', () => {
	it('maps import/require/dynamic to inbound (right) blue class', () => {
		for (const form of ['import', 'require', 'dynamic'] as const) {
			const m = formDirectionMarker(form);
			expect(m.direction).toBe('import');
			expect(m.className).toContain('atlas-inspect__form-tri--import');
			expect(m.className).not.toContain('--export');
		}
		expect(formDirectionMarker('import').label).toBe('import');
		expect(formDirectionMarker('require').label).toBe('require');
		expect(formDirectionMarker('dynamic').label).toBe('dynamic');
	});

	it('maps export to outbound (left) cyan class', () => {
		const m = formDirectionMarker('export');
		expect(m.direction).toBe('export');
		expect(m.label).toBe('export');
		expect(m.title).toBe('Export');
		expect(m.className).toContain('atlas-inspect__form-tri--export');
		expect(m.className).not.toContain('--import');
	});
});
