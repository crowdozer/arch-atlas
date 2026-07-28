/**
 * Inspect surface-claim precision: Program + rehydrated Exact mass uses exact
 * evidence path and callsite copy (not estimate wording).
 * Accordion title + form/perspective direction markers + multi-node summaries.
 */
import { describe, expect, it } from 'vitest';
import {
	edgesForNode,
	evidenceForEdges,
	indexFiles,
	type ImportEvidence,
	type LocPrecision,
} from '@core/index.ts';
import { precisionForSurfaceClaims } from '@shell/index.ts';
import {
	accordionDirectionFromForms,
	accordionDirectionKind,
	callsitesTitle,
	directionMarker,
	emptyCallsitesNote,
	formDirectionMarker,
	importSiteAccordionTitle,
	perspectiveDirectionKind,
	summarizeInspectEvidence,
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
			endLine: 42,
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
	it('uses full path · Lline when short enough (form is the marker)', () => {
		expect(importSiteAccordionTitle(sampleEvidence())).toBe(
			'src/client/app.ts · L42',
		);
	});

	it('falls back to basename when full path is long', () => {
		const longPath =
			'src/very/deeply/nested/path/that/makes/the/full/title/too/long/for/the/cap/module.ts';
		const title = importSiteAccordionTitle(
			sampleEvidence({ path: longPath, line: 7, form: 'require' }),
		);
		expect(title.startsWith('module.ts · L7')).toBe(true);
		expect(title.length).toBeLessThanOrEqual(80);
		expect(title).not.toContain('very/deeply');
		expect(title).not.toContain('require');
	});

	it('keeps full path without specifier when path · Lline fits under the cap', () => {
		const title = importSiteAccordionTitle(
			sampleEvidence({
				path: 'src/deep/nested/importer.ts',
				line: 3,
				form: 'import',
				specifier: './helpers',
			}),
		);
		expect(title).toBe('src/deep/nested/importer.ts · L3');
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
		expect(title).toBe('importer.ts · L9 · ./util');
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

	it('maps export to outbound (left) yellow/export class', () => {
		const m = formDirectionMarker('export');
		expect(m.direction).toBe('export');
		expect(m.label).toBe('export');
		expect(m.title).toBe('Export');
		expect(m.className).toContain('atlas-inspect__form-tri--export');
		expect(m.className).not.toContain('--import');
	});
});

describe('directionMarker labels (perspective chrome)', () => {
	it('export perspective label is export even when statement form is import', () => {
		// Inbound consumer of App: form=import, perspective=export
		const chrome = directionMarker('export');
		expect(chrome.label).toBe('export');
		expect(chrome.title).toBe('Export');
		expect(chrome.className).toContain('--export');
		// Form-only would still say import — paint must use perspective chrome
		expect(formDirectionMarker('import').label).toBe('import');
	});
});

describe('accordionDirectionKind / directionMarker', () => {
	it('follows edge form only — not section presence', () => {
		expect(accordionDirectionKind(sampleEvidence())).toBe('import');
		expect(
			accordionDirectionKind(sampleEvidence({ form: 'export' })),
		).toBe('export');
		expect(
			accordionDirectionKind(sampleEvidence({ form: 'require' })),
		).toBe('import');
	});

	it('import form stays import even with importedCode + callsites', () => {
		const ev: ImportEvidence = {
			...sampleEvidence(),
			importedCode: {
				epistemic: 'observed',
				path: 'src/hooks/useUser.ts',
				startLine: 1,
				endLine: 10,
				text: 'export function useUser() {}',
				note: 'export surface',
			},
			callsites: [
				{
					epistemic: 'inferred',
					path: 'src/pages/Profile.tsx',
					line: 4,
					symbol: 'useUser',
					text: 'useUser();',
				},
			],
		};
		// Regression: must not paint purple mixed for a pure import edge
		expect(accordionDirectionKind(ev)).toBe('import');
	});

	it('export form stays export even with callsites / importedCode', () => {
		const ev: ImportEvidence = {
			...sampleEvidence({ form: 'export' }),
			importedCode: {
				epistemic: 'observed',
				path: 'src/a.ts',
				startLine: 1,
				endLine: 2,
				text: 'export const x = 1;',
				note: 'export surface',
			},
			callsites: [
				{
					epistemic: 'inferred',
					path: 'src/a.ts',
					line: 2,
					symbol: 'x',
					text: 'x',
				},
			],
		};
		expect(accordionDirectionKind(ev)).toBe('export');
	});

	it('accordionDirectionFromForms is mixed only when both forms present', () => {
		expect(accordionDirectionFromForms(['import'])).toBe('import');
		expect(accordionDirectionFromForms(['export'])).toBe('export');
		expect(accordionDirectionFromForms(['import', 'require'])).toBe(
			'import',
		);
		expect(accordionDirectionFromForms(['import', 'export'])).toBe(
			'mixed',
		);
		expect(accordionDirectionFromForms(['export', 'dynamic'])).toBe(
			'mixed',
		);
	});

	it('directionMarker mixed uses purple indeterminate class', () => {
		const m = directionMarker('mixed');
		expect(m.direction).toBe('mixed');
		expect(m.className).toContain('--mixed');
		expect(m.title).toMatch(/import and export/i);
	});
});

describe('perspectiveDirectionKind (focus-relative)', () => {
	it('main.tsx → App.tsx is export when inspecting App (not form import)', () => {
		const ev: ImportEvidence = {
			...sampleEvidence({
				path: 'src/main.tsx',
				line: 4,
				text: "import { App } from './App';",
				form: 'import',
				specifier: './App',
				toLabel: 'src/App.tsx',
			}),
			importedCode: {
				epistemic: 'observed',
				path: 'src/App.tsx',
				startLine: 1,
				endLine: 8,
				text: 'export function App() {}',
				note: 'Estimate · whole file',
			},
		};
		// Form alone would say import — wrong chrome on App's modal
		expect(accordionDirectionKind(ev)).toBe('import');
		expect(perspectiveDirectionKind('src/App.tsx', ev)).toBe('export');
		// Same edge while inspecting main stays import
		expect(perspectiveDirectionKind('src/main.tsx', ev)).toBe('import');
	});

	it('outbound from focus stays import', () => {
		const ev = sampleEvidence({
			path: 'src/App.tsx',
			form: 'import',
			specifier: './pages/Home',
			toLabel: 'src/pages/Home.tsx',
		});
		expect(perspectiveDirectionKind('src/App.tsx', ev)).toBe('import');
	});
});

/**
 * Comprehensive multi-node graph → modal summary: directions, counts, symbols.
 * Mirrors the basic React demo shape (main → App → pages/hooks).
 */
describe('summarizeInspectEvidence across graph nodes', () => {
	const files = [
		{
			path: 'src/main.tsx',
			content: [
				"import React from 'react';",
				"import { App } from './App';",
				'const root = document.getElementById("root");',
				'void App;',
				'void React;',
				'',
			].join('\n'),
			byteLength: 1,
		},
		{
			path: 'src/App.tsx',
			content: [
				"import { HomePage } from './pages/Home';",
				"import { ProfilePage } from './pages/Profile';",
				"import { useUser } from './hooks/useUser';",
				'export function App() {',
				'  const u = useUser();',
				'  return HomePage && ProfilePage && u;',
				'}',
				'',
			].join('\n'),
			byteLength: 1,
		},
		{
			path: 'src/pages/Home.tsx',
			content: 'export function HomePage() { return null; }\n',
			byteLength: 1,
		},
		{
			path: 'src/pages/Profile.tsx',
			content: [
				"import { useUser } from '../hooks/useUser';",
				'export function ProfilePage() {',
				'  const user = useUser();',
				'  return user;',
				'}',
				'',
			].join('\n'),
			byteLength: 1,
		},
		{
			path: 'src/hooks/useUser.ts',
			content: 'export function useUser() { return { id: 1 }; }\n',
			byteLength: 1,
		},
		{
			path: 'package.json',
			content: '{"dependencies":{"react":"18"}}',
			byteLength: 1,
		},
	];

	const { graph } = indexFiles(files);

	function summaryFor(fileId: string) {
		const edges = edgesForNode(graph, { kind: 'file', id: fileId });
		const evidence = evidenceForEdges(graph, edges, 'estimate');
		return {
			edges,
			evidence,
			summary: summarizeInspectEvidence(evidence, fileId),
		};
	}

	it('indexes expected file→file edges for the demo graph', () => {
		const fileEdges = graph.edges.filter((e) => e.toKind === 'file');
		const pairs = fileEdges.map((e) => `${e.from}→${e.to}`);
		expect(pairs).toEqual(
			expect.arrayContaining([
				'src/main.tsx→src/App.tsx',
				'src/App.tsx→src/pages/Home.tsx',
				'src/App.tsx→src/pages/Profile.tsx',
				'src/App.tsx→src/hooks/useUser.ts',
				'src/pages/Profile.tsx→src/hooks/useUser.ts',
			]),
		);
	});

	it('App.tsx: main is export (inbound); Home/Profile/useUser are imports', () => {
		const { summary } = summaryFor('src/App.tsx');

		expect(summary.total).toBeGreaterThanOrEqual(4);
		// Inbound consumer
		const fromMain = summary.sites.find(
			(s) => s.statementPath === 'src/main.tsx',
		);
		expect(fromMain).toBeDefined();
		expect(fromMain!.form).toBe('import');
		expect(fromMain!.formDirection).toBe('import');
		expect(fromMain!.direction).toBe('export'); // perspective flip
		expect(fromMain!.toLabel).toMatch(/App/);

		// Outbound deps owned by App
		const outbound = summary.sites.filter(
			(s) => s.statementPath === 'src/App.tsx',
		);
		expect(outbound.length).toBeGreaterThanOrEqual(3);
		expect(outbound.every((s) => s.direction === 'import')).toBe(true);

		const targets = new Set(outbound.map((s) => s.toLabel));
		expect([...targets].some((t) => t.includes('Home'))).toBe(true);
		expect([...targets].some((t) => t.includes('Profile'))).toBe(true);
		expect([...targets].some((t) => t.includes('useUser'))).toBe(true);

		// Counts: ≥1 export (main), ≥3 imports
		expect(summary.exportCount).toBeGreaterThanOrEqual(1);
		expect(summary.importCount).toBeGreaterThanOrEqual(3);
		expect(summary.mixedCount).toBe(0);
		expect(summary.importCount + summary.exportCount).toBe(summary.total);
		expect(summary.metaLabel).toMatch(/import/i);
		expect(summary.metaLabel).toMatch(/export/i);
	});

	it('App.tsx: useUser symbol appears in callsites on the useUser import site', () => {
		const { summary } = summaryFor('src/App.tsx');
		const useUserSite = summary.sites.find(
			(s) =>
				s.statementPath === 'src/App.tsx' &&
				s.toLabel.includes('useUser'),
		);
		expect(useUserSite).toBeDefined();
		expect(useUserSite!.symbols).toContain('useUser');
		expect(useUserSite!.callsiteCount).toBeGreaterThanOrEqual(1);
		expect(useUserSite!.hasImportedCode).toBe(true);
	});

	it('main.tsx: App edge is import (owns statement); no false export flip', () => {
		const { summary } = summaryFor('src/main.tsx');
		const appSite = summary.sites.find((s) =>
			s.toLabel.includes('App'),
		);
		expect(appSite).toBeDefined();
		expect(appSite!.statementPath).toBe('src/main.tsx');
		expect(appSite!.direction).toBe('import');
		expect(appSite!.formDirection).toBe('import');

		// React package edge is also import from main's POV
		const reactSites = summary.sites.filter((s) =>
			/react/i.test(s.toLabel),
		);
		expect(reactSites.length).toBeGreaterThanOrEqual(1);
		expect(reactSites.every((s) => s.direction === 'import')).toBe(true);
		expect(summary.exportCount).toBe(0);
		expect(summary.importCount).toBe(summary.total);
	});

	it('useUser.ts: both App and Profile importers count as exports', () => {
		const { summary } = summaryFor('src/hooks/useUser.ts');
		const importers = summary.sites.filter((s) => s.direction === 'export');
		const importerPaths = new Set(importers.map((s) => s.statementPath));
		expect(importerPaths.has('src/App.tsx')).toBe(true);
		expect(importerPaths.has('src/pages/Profile.tsx')).toBe(true);
		expect(summary.exportCount).toBeGreaterThanOrEqual(2);
		// Hook file typically has no outbound imports in this fixture
		expect(
			summary.sites.every((s) => s.statementPath !== 'src/hooks/useUser.ts'),
		).toBe(true);
		expect(summary.importCount).toBe(0);
	});

	it('Profile.tsx: useUser is import with user symbol callsite', () => {
		const { summary } = summaryFor('src/pages/Profile.tsx');
		const useUser = summary.sites.find((s) =>
			s.toLabel.includes('useUser'),
		);
		expect(useUser).toBeDefined();
		expect(useUser!.direction).toBe('import');
		expect(useUser!.symbols).toContain('useUser');
		// Profile is imported by App → export facet
		const fromApp = summary.sites.find(
			(s) => s.statementPath === 'src/App.tsx',
		);
		expect(fromApp).toBeDefined();
		expect(fromApp!.direction).toBe('export');
		expect(summary.importCount).toBeGreaterThanOrEqual(1);
		expect(summary.exportCount).toBeGreaterThanOrEqual(1);
	});

	it('Home.tsx: only inbound export from App (leaf page)', () => {
		const { summary } = summaryFor('src/pages/Home.tsx');
		expect(summary.total).toBeGreaterThanOrEqual(1);
		expect(summary.exportCount).toBe(summary.total);
		expect(summary.importCount).toBe(0);
		expect(
			summary.sites.every((s) => s.statementPath === 'src/App.tsx'),
		).toBe(true);
		expect(summary.sites.every((s) => s.direction === 'export')).toBe(true);
	});

	it('titles are path · Lline without form text (marker carries direction)', () => {
		const { summary } = summaryFor('src/App.tsx');
		for (const s of summary.sites) {
			expect(s.title).toMatch(/ · L\d+/);
			expect(s.title).not.toMatch(/ · import$/);
			expect(s.title).not.toMatch(/ · export$/);
		}
	});

	it('without focusFileId, directions collapse to form (no inbound flip)', () => {
		const edges = edgesForNode(graph, {
			kind: 'file',
			id: 'src/App.tsx',
		});
		const evidence = evidenceForEdges(graph, edges, 'estimate');
		const bare = summarizeInspectEvidence(evidence, null);
		const fromMain = bare.sites.find(
			(s) => s.statementPath === 'src/main.tsx',
		);
		expect(fromMain?.direction).toBe('import'); // form only
		expect(fromMain?.formDirection).toBe('import');
	});
});
