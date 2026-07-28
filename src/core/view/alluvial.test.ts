import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	alluvialTooltipCustomHTML,
	buildAlluvialPayload,
	compareAlluvialBands,
	incidentBandMass,
	isAlluvialRailName,
	isImportPadScaffoldLink,
	isInRailName,
	isOutRailName,
	isOverflowNodeName,
	pathSegmentProximity,
	projectAlluvial,
} from '@core/view/alluvial.ts';
import {
	carbonColumnHeader,
	carbonSameColumn,
	layoutAlluvialLikeCarbon,
} from '@core/view/alluvialCarbonLayout.ts';
import type { AlluvialPayload } from '@core/graph/types.ts';
import {
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
import { projectModuleFocus } from '@core/view/moduleFocus.ts';
import {
	edgeMatchesPackage,
	primaryImporterFile,
} from '@core/view/packageImporters.ts';
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

describe('primaryImporterFile', () => {
	it('nodemailer → sole importer email.ts', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		expect(primaryImporterFile(graph, 'nodemailer')).toBe('src/lib/email.ts');
	});

	it('returns null for unknown package', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
		expect(primaryImporterFile(graph, 'definitely-not-a-pkg-xyz')).toBeNull();
	});

	it('edgeMatchesPackage matches id and display label', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const edge = graph.edges.find((e) => e.to === 'nodemailer');
		expect(edge).toBeTruthy();
		expect(edgeMatchesPackage(edge!, 'nodemailer')).toBe(true);
		expect(edgeMatchesPackage(edge!, 'not-it')).toBe(false);
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

	it('target-loc reverse total = sum of importer LOC (not shared focus LOC)', () => {
		// Reverse hub mass under estimate target-loc uses hubReverseEdgeWeight:
		// each importer→focus edge weighs importer LOC (consumer size), not
		// inDegree * LOC(focus) which collapses every export band to the same mass.
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const fileId = 'src/lib/redis.ts';
		const reverseEdges = graph.edges.filter(
			(e) => e.toKind === 'file' && e.to === fileId,
		);
		expect(reverseEdges.length).toBe(12);
		const expected = reverseEdges.reduce((sum, e) => {
			const n = fileLineCount(graph, e.from);
			return sum + (n > 0 ? n : 1);
		}, 0);
		expect(expected).toBeGreaterThan(12);

		const rev = projectFileImporters(graph, fileId, { weightAxis: 'target-loc' })!;
		const { out } = flowTotals(rev.data);
		const focusOut = out.get(fileId) ?? 0;
		expect(focusOut).toBe(expected);
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

describe('layoutAlluvialLikeCarbon (post-Carbon geometry)', () => {
	function syntheticPayload(
		nodes: { name: string; category: string }[],
		links: { source: string; target: string; value: number }[],
	): AlluvialPayload {
		return {
			data: links,
			options: {
				title: '',
				theme: 'g100',
				height: '400px',
				animations: false,
				toolbar: { enabled: false },
				legend: { enabled: false, clickable: false },
				accessibility: { svgAriaLabel: 'test' },
				alluvial: {
					units: 'edges',
					nodes: nodes.map((n, rank) => ({ ...n, rank })),
					nodeAlignment: 'left',
				},
				color: { scale: {} },
				tooltip: { enabled: false },
			},
			meta: {
				focus: { kind: 'file', id: 'f', label: 'f' },
				nodeRef: {},
				nodeRank: {},
			},
		};
	}

	function withAlign(
		payload: AlluvialPayload,
		nodeAlignment: 'left' | 'right' | 'center',
	): AlluvialPayload {
		return {
			...payload,
			options: {
				...payload.options,
				alluvial: { ...payload.options.alluvial, nodeAlignment },
			},
		};
	}

	it('justify (Carbon default): leaf logger snaps under External with ioredis', () => {
		// Pad on package only; logger is a sink → justify pushes it rightmost
		const base = syntheticPayload(
			[
				{ name: 'free', category: 'Exports' },
				{ name: 'File', category: 'File' },
				{ name: 'logger', category: 'Imports' },
				{ name: 'rail', category: 'Imports' },
				{ name: 'ioredis', category: 'External' },
			],
			[
				{ source: 'free', target: 'File', value: 10 },
				{ source: 'File', target: 'logger', value: 5 },
				{ source: 'File', target: 'rail', value: 5 },
				{ source: 'rail', target: 'ioredis', value: 5 },
			],
		);
		// Carbon treats unknown/center as justify
		const layout = layoutAlluvialLikeCarbon(withAlign(base, 'center'));
		expect(carbonSameColumn(layout, 'logger', 'ioredis')).toBe(true);
		expect(carbonColumnHeader(layout, 'logger')).toBe('External');
		expect(carbonColumnHeader(layout, 'ioredis')).toBe('External');
	});

	it('left align: logger stays Imports; ioredis External after pad', () => {
		const base = syntheticPayload(
			[
				{ name: 'free', category: 'Exports' },
				{ name: 'File', category: 'File' },
				{ name: 'logger', category: 'Imports' },
				{ name: 'rail', category: 'Imports' },
				{ name: 'ioredis', category: 'External' },
			],
			[
				{ source: 'free', target: 'File', value: 10 },
				{ source: 'File', target: 'logger', value: 5 },
				{ source: 'File', target: 'rail', value: 5 },
				{ source: 'rail', target: 'ioredis', value: 5 },
			],
		);
		const layout = layoutAlluvialLikeCarbon(withAlign(base, 'left'));
		expect(carbonSameColumn(layout, 'logger', 'ioredis')).toBe(false);
		expect(carbonColumnHeader(layout, 'logger')).toBe('Imports');
		expect(carbonColumnHeader(layout, 'ioredis')).toBe('External');
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
	 * Paint law: pure rail↔rail + External package hop pads + out-rail free-source
	 * pads undrawn. in-rail→non-External still paints. Real file edges paint.
	 */
	it('import pad scaffold vs forward mass carriers', () => {
		const inRail = '\u200b·in-rail·h2';
		const outRail = '\u200b·out-rail·h1';
		const file = 'src/types.ts';
		const focus = 'UserCard.tsx';
		// Pure rail↔rail
		expect(isImportPadScaffoldLink(inRail, '\u200b·in-rail·h1')).toBe(true);
		expect(isImportPadScaffoldLink(outRail, '\u200b·out-rail·h2')).toBe(true);
		// External package hop pads (hub topology)
		expect(isImportPadScaffoldLink(focus, inRail)).toBe(true);
		expect(
			isImportPadScaffoldLink(inRail, 'ioredis', { targetCategory: 'External' }),
		).toBe(true);
		// Reverse free-source out-rail pads undrawn (terminator cutoff)
		expect(isImportPadScaffoldLink(outRail, file)).toBe(true);
		expect(isImportPadScaffoldLink(focus, outRail)).toBe(true);
		// in-rail → non-External file still paints (not package hop)
		expect(isImportPadScaffoldLink(inRail, file)).toBe(false);
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

describe('band sort (name / mass / dir-walk)', () => {
	const focusPath = 'src/lib/focus.ts';
	const rail = '\u200b·in-rail·h2';
	const overflow = '+ 3 more';
	const other = '(other ends)';

	it('pathSegmentProximity ranks longer common prefix first', () => {
		const a = pathSegmentProximity('src/lib/utils.ts', focusPath);
		const b = pathSegmentProximity('src/app/page.ts', focusPath);
		const c = pathSegmentProximity('other/x.ts', focusPath);
		expect(a.commonPrefix).toBeGreaterThan(b.commonPrefix);
		expect(b.commonPrefix).toBeGreaterThan(c.commonPrefix);
		expect(a.segmentDelta).toBe(0);
	});

	it('incidentBandMass sums endpoints and skips pure rail↔rail', () => {
		const mass = incidentBandMass([
			{ source: 'a', target: 'b', value: 5 },
			{ source: 'a', target: 'c', value: 2 },
			{ source: rail, target: '\u200b·out-rail·h1', value: 99 },
		]);
		expect(mass.get('a')).toBe(7);
		expect(mass.get('b')).toBe(5);
		expect(mass.get('c')).toBe(2);
		expect(mass.has(rail)).toBe(false);
	});

	it('overflow last and rails after real nodes under every mode', () => {
		const names = [overflow, 'z-file', rail, 'a-file', other];
		const nodeRef = {
			'z-file': { kind: 'file' as const, id: 'z-file' },
			'a-file': { kind: 'file' as const, id: 'a-file' },
		};
		const mass = new Map([
			['z-file', 1],
			['a-file', 10],
		]);
		for (const mode of ['name', 'mass', 'dir-walk'] as const) {
			const sorted = [...names].sort((a, b) =>
				compareAlluvialBands(a, b, {
					mode,
					mass,
					nodeRef,
					focusPath,
				}),
			);
			expect(isOverflowNodeName(sorted[sorted.length - 1]!)).toBe(true);
			expect(isOverflowNodeName(sorted[sorted.length - 2]!)).toBe(true);
			const real = sorted.filter(
				(n) => !isOverflowNodeName(n) && !isAlluvialRailName(n),
			);
			const rails = sorted.filter((n) => isAlluvialRailName(n));
			const overs = sorted.filter((n) => isOverflowNodeName(n));
			expect(sorted).toEqual([...real, ...rails, ...overs]);
		}
	});

	it('name mode is alpha among real nodes', () => {
		const names = ['zebra.ts', 'alpha.ts', 'mid.ts'];
		const sorted = [...names].sort((a, b) =>
			compareAlluvialBands(a, b, {
				mode: 'name',
				mass: new Map(),
				nodeRef: {},
				focusPath,
			}),
		);
		expect(sorted).toEqual(['alpha.ts', 'mid.ts', 'zebra.ts']);
	});

	it('mass mode orders higher incident mass first', () => {
		const names = ['light', 'heavy', 'mid'];
		const mass = new Map([
			['light', 1],
			['mid', 5],
			['heavy', 20],
		]);
		const sorted = [...names].sort((a, b) =>
			compareAlluvialBands(a, b, {
				mode: 'mass',
				mass,
				nodeRef: {},
				focusPath,
			}),
		);
		expect(sorted).toEqual(['heavy', 'mid', 'light']);
	});

	it('dir-walk prefers path proximity to focus; packages after files', () => {
		const names = [
			'src/lib/utils.ts',
			'src/app/page.ts',
			'lodash',
			'other/x.ts',
		];
		const nodeRef = {
			'src/lib/utils.ts': { kind: 'file' as const, id: 'src/lib/utils.ts' },
			'src/app/page.ts': { kind: 'file' as const, id: 'src/app/page.ts' },
			'other/x.ts': { kind: 'file' as const, id: 'other/x.ts' },
			lodash: { kind: 'package' as const, id: 'lodash' },
		};
		const sorted = [...names].sort((a, b) =>
			compareAlluvialBands(a, b, {
				mode: 'dir-walk',
				mass: new Map(),
				nodeRef,
				focusPath,
			}),
		);
		expect(sorted[0]).toBe('src/lib/utils.ts');
		expect(sorted[sorted.length - 1]).toBe('lodash');
		expect(sorted.indexOf('src/app/page.ts')).toBeLessThan(
			sorted.indexOf('other/x.ts'),
		);
	});

	it('dir-walk multi-instance keys on nodeRef.id then label', () => {
		const a = 'src/lib/utils.ts';
		const a2 = 'src/lib/utils.ts · h2';
		const b = 'src/app/page.ts';
		const nodeRef = {
			[a]: { kind: 'file' as const, id: 'src/lib/utils.ts' },
			[a2]: { kind: 'file' as const, id: 'src/lib/utils.ts' },
			[b]: { kind: 'file' as const, id: 'src/app/page.ts' },
		};
		const sorted = [b, a2, a].sort((x, y) =>
			compareAlluvialBands(x, y, {
				mode: 'dir-walk',
				mass: new Map(),
				nodeRef,
				focusPath,
			}),
		);
		// both utils instances before page; among instances label order
		expect(sorted.slice(0, 2).sort()).toEqual([a, a2].sort());
		expect(sorted[2]).toBe(b);
		expect(sorted.indexOf(a)).toBeLessThan(sorted.indexOf(a2));
	});

	it('buildAlluvialPayload writes rank + nodeRank under mass mode', () => {
		const links = [
			{ source: 'heavy', target: 'focus', value: 10 },
			{ source: 'light', target: 'focus', value: 1 },
			{ source: overflow, target: 'focus', value: 2 },
		];
		const nodeMeta = new Map([
			['focus', { category: 'File', color: '#0' }],
			['heavy', { category: 'Imports', color: '#1' }],
			['light', { category: 'Imports', color: '#2' }],
			[overflow, { category: 'Imports', color: '#3' }],
		]);
		const nodeRef = {
			focus: { kind: 'file' as const, id: 'focus' },
			heavy: { kind: 'file' as const, id: 'heavy' },
			light: { kind: 'file' as const, id: 'light' },
		};
		const payload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder: ['Imports', 'File'],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef,
			startId: 'focus',
			bandSort: 'mass',
		});
		expect(payload).not.toBeNull();
		const imports = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		expect(imports).toEqual(['heavy', 'light', overflow]);
		expect(payload!.meta.nodeRank!['heavy']).toBe(0);
		expect(payload!.meta.nodeRank!['light']).toBe(1);
		expect(payload!.meta.nodeRank![overflow]).toBe(2);
		expect(
			payload!.options.alluvial.nodes.find((n) => n.name === 'heavy')?.rank,
		).toBe(0);
	});

	it('buildAlluvialPayload default bandSort is name (alpha)', () => {
		const links = [
			{ source: 'zebra', target: 'focus', value: 1 },
			{ source: 'alpha', target: 'focus', value: 99 },
		];
		const nodeMeta = new Map([
			['focus', { category: 'File', color: '#0' }],
			['zebra', { category: 'Imports', color: '#1' }],
			['alpha', { category: 'Imports', color: '#2' }],
		]);
		const payload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder: ['Imports', 'File'],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef: {
				focus: { kind: 'file', id: 'focus' },
				zebra: { kind: 'file', id: 'zebra' },
				alpha: { kind: 'file', id: 'alpha' },
			},
			startId: 'focus',
		});
		const imports = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		expect(imports).toEqual(['alpha', 'zebra']);
	});
});
