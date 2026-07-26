import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	alluvialTooltipCustomHTML,
	isAlluvialRailName,
	isImportPadScaffoldLink,
	isInRailName,
	isOutRailName,
	projectAlluvial,
} from '@core/view/alluvial.ts';
import {
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
import { projectModuleFocus } from '@core/view/moduleFocus.ts';
import { projectPackageImporters } from '@core/view/packageImporters.ts';
import { fileLineCount, type WeightAxis } from '@core/view/weight.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function walk(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full, base));
		else {
			const rel = path.relative(base, full).split(path.sep).join('/');
			const content = readFileSync(full, 'utf8');
			out.push({ path: rel, content, byteLength: Buffer.byteLength(content) });
		}
	}
	return out;
}

function flowTotals(data: { source: string; target: string; value: number }[]) {
	const out = new Map<string, number>();
	const inn = new Map<string, number>();
	for (const l of data) {
		out.set(l.source, (out.get(l.source) ?? 0) + l.value);
		inn.set(l.target, (inn.get(l.target) ?? 0) + l.value);
	}
	return { out, inn };
}

describe('projectAlluvial conservation', () => {
	it('uses Imports / Hop 1 / File — never Modules folders', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const payload = projectAlluvial(graph, 'middleware.ts');
		expect(payload).not.toBeNull();
		const cats = new Set(payload!.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Modules')).toBe(false);
		expect(cats.has('Ends')).toBe(false);
		expect(cats.has('Code')).toBe(false);

		const { out, inn } = flowTotals(payload!.data);
		// Hop 1 file leaves conserve
		for (const n of payload!.options.alluvial.nodes) {
			if (n.category !== 'Hop 1') continue;
			expect(inn.get(n.name) ?? 0, n.name).toBe(out.get(n.name) ?? 0);
		}
		const endOut = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.reduce((s, e) => s + (out.get(e.name) ?? 0), 0);
		const fileIn = inn.get('middleware.ts') ?? 0;
		expect(fileIn).toBe(endOut);
		expect(fileIn).toBeGreaterThan(0);
	});

	it('react main keeps hop conservation', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
		const payload = projectAlluvial(graph, 'src/main.tsx');
		expect(payload).not.toBeNull();
		const { out, inn } = flowTotals(payload!.data);
		for (const n of payload!.options.alluvial.nodes) {
			if (n.category !== 'Hop 1') continue;
			expect(inn.get(n.name) ?? 0).toBe(out.get(n.name) ?? 0);
		}
	});

	it('populates focus and nodeRef for drill-down', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const payload = projectAlluvial(graph, 'middleware.ts');
		expect(payload).not.toBeNull();
		expect(payload!.meta.startId).toBe('middleware.ts');
		expect(payload!.meta.focus).toEqual({
			kind: 'file',
			id: 'middleware.ts',
			label: 'middleware.ts',
		});
		expect(payload!.meta.nodeRef['middleware.ts']).toEqual({
			kind: 'file',
			id: 'middleware.ts',
		});
		const endNodes = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		);
		const drillableEnd = endNodes.find((n) => !n.name.startsWith('('));
		expect(drillableEnd).toBeTruthy();
		const ref = payload!.meta.nodeRef[drillableEnd!.name];
		expect(ref).toBeTruthy();
		expect(['package', 'unresolved']).toContain(ref.kind);
	});

	it.each(['importer-loc', 'target-loc'] as WeightAxis[])(
		'conserves under weightAxis=%s',
		(weightAxis) => {
			const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
			const payload = projectAlluvial(graph, 'middleware.ts', { weightAxis });
			expect(payload).not.toBeNull();
			const { out, inn } = flowTotals(payload!.data);
			for (const n of payload!.options.alluvial.nodes) {
				if (n.category !== 'Hop 1') continue;
				expect(inn.get(n.name) ?? 0, n.name).toBe(out.get(n.name) ?? 0);
			}
			const ends = payload!.options.alluvial.nodes
				.filter((n) => n.category === 'Imports')
				.map((n) => n.name);
			const endOut = ends.reduce((s, e) => s + (out.get(e) ?? 0), 0);
			const fileIn = inn.get('middleware.ts') ?? 0;
			expect(fileIn).toBe(endOut);
			expect(fileIn).toBeGreaterThan(0);
			if (weightAxis === 'importer-loc') {
				expect(fileIn).toBeGreaterThan(ends.length > 0 ? 1 : 0);
			}
		},
	);
});

describe('projectPackageImporters', () => {
	it('nodemailer importers in demo-next-complex (src/lib/email.ts only)', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const payload = projectPackageImporters(graph, 'nodemailer', {
			weightAxis: 'import-edges',
		});
		expect(payload).not.toBeNull();
		expect(payload!.meta.focus.kind).toBe('package');
		expect(payload!.meta.focus.label).toBe('nodemailer');

		// Left column is package; right is importer(s)
		const packageNodes = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Package',
		);
		expect(packageNodes.map((n) => n.name)).toEqual(['nodemailer']);

		const importers = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Importers',
		);
		expect(importers.length).toBe(1);
		// Single importer → file promote; full path label
		expect(importers[0]!.name).toBe('src/lib/email.ts');

		const total = payload!.data.reduce((s, l) => s + l.value, 0);
		expect(total).toBe(1);
		expect(payload!.data.every((l) => l.source === 'nodemailer')).toBe(true);
		expect(payload!.data.every((l) => l.target !== 'nodemailer')).toBe(true);

		const importerRef = payload!.meta.nodeRef[importers[0]!.name];
		expect(importerRef).toEqual({ kind: 'file', id: 'src/lib/email.ts' });
		expect(payload!.meta.nodeRef.nodemailer.kind).toBe('package');
	});

	it('conserves package → importer weights', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		// redis is used from multiple places likely
		const payload = projectPackageImporters(graph, 'ioredis');
		// may or may not exist — try a common one; fall back to nodemailer
		const p =
			payload ??
			projectPackageImporters(graph, 'nodemailer') ??
			projectPackageImporters(graph, 'next');
		expect(p).not.toBeNull();
		const { out, inn } = flowTotals(p!.data);
		const packageLabel = p!.meta.focus.label;
		const packageOut = out.get(packageLabel) ?? 0;
		const importerIn = [...inn.entries()]
			.filter(([k]) => k !== packageLabel)
			.reduce((s, [, v]) => s + v, 0);
		expect(packageOut).toBe(importerIn);
		expect(packageOut).toBeGreaterThan(0);
	});

	it('returns null for unknown package', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
		expect(projectPackageImporters(graph, 'definitely-not-a-pkg-xyz')).toBeNull();
	});

	it('target-loc total equals inDegree (package fallback weight 1)', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const end = catalog.ends.find((e) => e.id === 'nodemailer') ?? catalog.ends[0];
		expect(end).toBeTruthy();
		const payload = projectPackageImporters(graph, end!.id, {
			weightAxis: 'target-loc',
		});
		expect(payload).not.toBeNull();
		const total = payload!.data.reduce((s, l) => s + l.value, 0);
		expect(total).toBe(end!.inDegree);
	});
});

describe('projectFileImporters', () => {
	it('redis.ts fan-in dominant opens reverse (not thin ioredis band)', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const fileId = 'src/lib/redis.ts';
		expect(preferFileImportersView(graph, fileId)).toBe(true);
		const rev = projectFileImporters(graph, fileId, { weightAxis: 'import-edges' })!;
		const forward = projectAlluvial(graph, fileId, { weightAxis: 'import-edges' })!;
		const revTotal = flowTotals(rev.data).out.get(fileId) ?? 0;
		const fwdTotal = forward.data.reduce((s, l) => s + l.value, 0);
		expect(revTotal).toBeGreaterThan(fwdTotal);
		expect(revTotal).toBe(12);
	});

	it('logger.ts is a fan-in hub: reverse view lists importers', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const fileId = 'src/lib/logger.ts';
		expect(preferFileImportersView(graph, fileId)).toBe(true);

		const forward = projectAlluvial(graph, fileId);
		// leaf util: no package edges reachable from itself
		const hasRealPkg =
			forward?.data.some(
				(l) => l.source !== '(no package imports)' && l.target !== '(no package imports)',
			) ?? false;
		expect(hasRealPkg).toBe(false);

		const rev = projectFileImporters(graph, fileId);
		expect(rev).not.toBeNull();
		expect(rev!.meta.focus).toEqual({
			kind: 'file',
			id: fileId,
			label: fileId,
		});
		// File → Imports only (folders are not a hop stage)
		const cats = new Set(rev!.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('Import folders')).toBe(false);
		const { out, inn } = flowTotals(rev!.data);
		const fileOut = out.get(fileId) ?? 0;
		const importerIn = rev!.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.reduce((s, n) => s + (inn.get(n.name) ?? 0), 0);
		expect(fileOut).toBe(importerIn);
		expect(fileOut).toBeGreaterThan(5); // many demo modules import logger
	});

	it('target-loc total = inDegree * LOC(focus) for redis.ts', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const fileId = 'src/lib/redis.ts';
		const inDegree = graph.edges.filter(
			(e) => e.toKind === 'file' && e.to === fileId,
		).length;
		expect(inDegree).toBe(12);
		const loc = fileLineCount(graph, fileId);
		expect(loc).toBeGreaterThan(1);

		const rev = projectFileImporters(graph, fileId, { weightAxis: 'target-loc' })!;
		const { out } = flowTotals(rev.data);
		const focusOut = out.get(fileId) ?? 0;
		expect(focusOut).toBe(inDegree * loc);
	});
});

describe('projectModuleFocus', () => {
	it('only includes package edges from the given folder', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const payload = projectModuleFocus(graph, 'src/lib', {
			weightAxis: 'import-edges',
		});
		expect(payload).not.toBeNull();
		expect(payload!.meta.focus).toEqual({
			kind: 'module',
			id: 'src/lib',
			label: 'src/lib',
		});

		// Module left node
		expect(
			payload!.options.alluvial.nodes.some(
				(n) => n.category === 'Module' && n.name === 'src/lib',
			),
		).toBe(true);

		// nodemailer only imported from src/lib — must appear
		const endNames = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Ends')
			.map((n) => n.name);
		expect(endNames).toContain('nodemailer');

		// Module radiates to package ends
		expect(payload!.data.every((l) => l.source === 'src/lib')).toBe(true);

		// Conservation: module out == sum ends in
		const { out, inn } = flowTotals(payload!.data);
		const endIn = endNames.reduce((s, e) => s + (inn.get(e) ?? 0), 0);
		expect(out.get('src/lib')).toBe(endIn);

		// Count should match graph edges from topFolder src/lib to package/unresolved
		const expected = graph.edges.filter(
			(e) =>
				e.toKind !== 'file' &&
				(e.from === 'src/lib' || e.from.startsWith('src/lib/')),
		).length;
		// topFolder('src/lib/email.ts') === 'src/lib'
		const byTop = graph.edges.filter((e) => {
			if (e.toKind === 'file') return false;
			const parts = e.from.split('/');
			const top =
				parts.length <= 1
					? '(root)'
					: parts[0] === 'src' && parts.length > 2
						? `src/${parts[1]}`
						: parts[0];
			return top === 'src/lib';
		}).length;
		expect(endIn).toBe(byTop);
		expect(expected).toBe(byTop);
	});

	it('populates nodeRef for packages and module', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const payload = projectModuleFocus(graph, 'src/lib');
		expect(payload).not.toBeNull();
		expect(payload!.meta.nodeRef['src/lib']).toEqual({
			kind: 'module',
			id: 'src/lib',
		});
		expect(payload!.meta.nodeRef.nodemailer?.kind).toBe('package');
	});

	it('returns null for folder with no package edges', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
		expect(projectModuleFocus(graph, 'definitely/missing')).toBeNull();
	});
});

describe('alluvial pad-rail tooltip hygiene', () => {
	it('detects and classifies rail ids (in vs out)', () => {
		expect(isAlluvialRailName('\u200b·in-rail·h2')).toBe(true);
		expect(isAlluvialRailName('·in-rail·h2 (57)')).toBe(true);
		expect(isAlluvialRailName('\u200b·out-rail·h1')).toBe(true);
		expect(isAlluvialRailName('app/dashboard/page.tsx')).toBe(false);
		expect(isInRailName('\u200b·in-rail·h2')).toBe(true);
		expect(isInRailName('\u200b·out-rail·h1')).toBe(false);
		expect(isOutRailName('\u200b·out-rail·h1')).toBe(true);
		expect(isOutRailName('\u200b·in-rail·h2')).toBe(false);
	});

	/**
	 * Paint law: only import free-source scaffolding is invisible pad-band.
	 * Export File→out-rail→deep-target carries real File mass — not scaffold.
	 */
	it('import pad scaffold vs export out-rail mass carriers', () => {
		const inRail = '\u200b·in-rail·h2';
		const outRail = '\u200b·out-rail·h1';
		const file = 'src/types.ts';
		const focus = 'UserCard.tsx';
		// Import free-source pads → scaffold
		expect(isImportPadScaffoldLink(inRail, file)).toBe(true);
		expect(isImportPadScaffoldLink(inRail, '\u200b·in-rail·h1')).toBe(true);
		// Export intermediate pads → paint-eligible (NOT scaffold)
		expect(isImportPadScaffoldLink(focus, outRail)).toBe(false);
		expect(isImportPadScaffoldLink(outRail, file)).toBe(false);
		expect(isImportPadScaffoldLink(outRail, '\u200b·out-rail·h2')).toBe(false);
		// Real edges
		expect(isImportPadScaffoldLink(file, focus)).toBe(false);
	});

	it('strips rail endpoint from band tooltip', () => {
		const html = alluvialTooltipCustomHTML(
			null,
			'<p>default</p>',
			{
				source: { name: '\u200b·in-rail·h2' },
				target: { name: 'app/dashboard/page.tsx' },
				value: 57,
			},
		);
		expect(html).toContain('app/dashboard/page.tsx');
		expect(html).toContain('57');
		expect(html).not.toMatch(/in-rail/i);
	});

	it('suppresses rail→rail tooltip', () => {
		const html = alluvialTooltipCustomHTML(
			null,
			'<p>default</p>',
			{
				source: { name: '\u200b·in-rail·h3' },
				target: { name: '\u200b·in-rail·h2' },
				value: 57,
			},
		);
		expect(html).toBe('');
	});

	it('scrubs rail from defaultHTML when datum parse fails', () => {
		// Carbon sometimes omits parseable datum; belt-and-suspenders on default HTML
		const html = alluvialTooltipCustomHTML(
			null,
			'<ul class="multi-tooltip"><li><div class="datapoint-tooltip"><p class="value">·in-rail·h2 → app/dashboard/page.tsx (57)</p></div></li></ul>',
			null,
		);
		expect(html).toContain('app/dashboard/page.tsx');
		expect(html).toContain('57');
		expect(html).not.toMatch(/in-rail/i);
	});
});
