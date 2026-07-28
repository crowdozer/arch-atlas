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
	flowBandMass,
	flowTargetBandMass,
	hubFlowPivotIndex,
	nodeBandMass,
	isAlluvialRailName,
	isImportPadScaffoldLink,
	isInRailName,
	isOutRailName,
	isOverflowNodeName,
	projectAlluvial,
	spineAwayBandMass,
	spineFacingBandMass,
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

describe('band sort (name / flow / flow-target / node)', () => {
	const rail = '\u200b·in-rail·h2';
	const overflow = '+ 3 more';
	const other = '(other ends)';

	/** Dual-side file-hub fixture: free sources left + pure sinks right. */
	const dualHub = {
		categoryOrder: ['Exports', 'File', 'Imports'] as const,
		links: [
			// Exports free sources → File (out only on export side)
			{ source: 'RootShell', target: 'focus', value: 16 },
			{ source: 'session-exp', target: 'focus', value: 13 },
			{ source: 'logger', target: 'focus', value: 8 },
			// File → Imports pure sinks (in only on import side)
			{ source: 'focus', target: 'session-imp', value: 10 },
			{ source: 'focus', target: 'SiteHeader', value: 8 },
			{ source: 'focus', target: 'zod', value: 2 },
			// pure rail↔rail must not contribute
			{ source: rail, target: '\u200b·out-rail·h1', value: 99 },
		],
		nodeMeta: new Map([
			['focus', { category: 'File', color: '#0' }],
			['RootShell', { category: 'Exports', color: '#1' }],
			['session-exp', { category: 'Exports', color: '#2' }],
			['logger', { category: 'Exports', color: '#3' }],
			['session-imp', { category: 'Imports', color: '#4' }],
			['SiteHeader', { category: 'Imports', color: '#5' }],
			['zod', { category: 'Imports', color: '#6' }],
		]),
		nodeRef: {
			focus: { kind: 'file' as const, id: 'focus' },
			RootShell: { kind: 'file' as const, id: 'RootShell' },
			'session-exp': { kind: 'file' as const, id: 'session-exp' },
			logger: { kind: 'file' as const, id: 'logger' },
			'session-imp': { kind: 'file' as const, id: 'session-imp' },
			SiteHeader: { kind: 'file' as const, id: 'SiteHeader' },
			zod: { kind: 'package' as const, id: 'zod' },
		},
	};

	it('hubFlowPivotIndex prefers File then External', () => {
		expect(hubFlowPivotIndex(['Exports', 'File', 'Imports'])).toBe(1);
		expect(hubFlowPivotIndex(['Export hop 2', 'Exports', 'External'])).toBe(
			2,
		);
		expect(hubFlowPivotIndex(['Ends', 'Modules', 'Code'])).toBeNull();
	});

	it('flowBandMass is pure outbound (primitive)', () => {
		// a → mid → b  + a → leaf
		const mass = flowBandMass([
			{ source: 'a', target: 'mid', value: 10 },
			{ source: 'mid', target: 'b', value: 10 },
			{ source: 'a', target: 'leaf', value: 3 },
			{ source: rail, target: '\u200b·out-rail·h1', value: 99 },
		]);
		expect(mass.get('a')).toBe(13);
		expect(mass.get('mid')).toBe(10);
		expect(mass.has('b')).toBe(false); // pure sink: no outbound
		expect(mass.has('leaf')).toBe(false);
		expect(mass.has(rail)).toBe(false);
	});

	it('flowTargetBandMass is pure inbound (primitive)', () => {
		const mass = flowTargetBandMass([
			{ source: 'a', target: 'mid', value: 10 },
			{ source: 'mid', target: 'b', value: 10 },
			{ source: 'a', target: 'leaf', value: 3 },
			{ source: rail, target: '\u200b·out-rail·h1', value: 99 },
		]);
		expect(mass.get('mid')).toBe(10);
		expect(mass.get('b')).toBe(10);
		expect(mass.get('leaf')).toBe(3);
		expect(mass.has('a')).toBe(false); // pure free source
		expect(mass.has(rail)).toBe(false);
	});

	it('spineFacing: dual-side hub ranks Exports by out AND Imports by in', () => {
		const mass = spineFacingBandMass(
			dualHub.links,
			dualHub.nodeMeta,
			dualHub.categoryOrder,
		);
		// left of File → outbound
		expect(mass.get('RootShell')).toBe(16);
		expect(mass.get('session-exp')).toBe(13);
		expect(mass.get('logger')).toBe(8);
		// right of File → inbound
		expect(mass.get('session-imp')).toBe(10);
		expect(mass.get('SiteHeader')).toBe(8);
		expect(mass.get('zod')).toBe(2);
		// File pivot → max(in, out) = max(37, 20) = 37
		expect(mass.get('focus')).toBe(37);
		expect(mass.has(rail)).toBe(false);
	});

	it('spineAway: dual-side hub inverts each side vs spineFacing', () => {
		const facing = spineFacingBandMass(
			dualHub.links,
			dualHub.nodeMeta,
			dualHub.categoryOrder,
		);
		const away = spineAwayBandMass(
			dualHub.links,
			dualHub.nodeMeta,
			dualHub.categoryOrder,
		);
		// free sources: facing out > 0; away in = 0 → absent
		expect(facing.get('RootShell')).toBe(16);
		expect(away.has('RootShell')).toBe(false);
		// pure sinks: facing in > 0; away out = 0 → absent
		expect(facing.get('session-imp')).toBe(10);
		expect(away.has('session-imp')).toBe(false);
		// pivot still max
		expect(away.get('focus')).toBe(37);
	});

	it('spineAway multi-hop: left ranks by inbound; right by outbound', () => {
		const categoryOrder = [
			'Export hop 2',
			'Exports',
			'File',
			'Imports',
			'Import hop 2',
		];
		const links = [
			{ source: 'outer-parent', target: 'RootShell', value: 20 },
			{ source: 'RootShell', target: 'focus', value: 16 },
			{ source: 'focus', target: 'session', value: 10 },
			{ source: 'session', target: 'redis', value: 50 },
			{ source: 'session', target: 'types', value: 5 },
		];
		const nodeMeta = new Map([
			['outer-parent', { category: 'Export hop 2', color: '#1' }],
			['RootShell', { category: 'Exports', color: '#2' }],
			['focus', { category: 'File', color: '#0' }],
			['session', { category: 'Imports', color: '#3' }],
			['redis', { category: 'Import hop 2', color: '#4' }],
			['types', { category: 'Import hop 2', color: '#5' }],
		]);
		const away = spineAwayBandMass(links, nodeMeta, categoryOrder);
		// left of File → inbound (inputs into export consumers)
		expect(away.get('RootShell')).toBe(20);
		// right of File → outbound (emissions deeper)
		expect(away.get('session')).toBe(55);
		// pure sink under out → absent (mass 0 not stored)
		expect(away.has('redis')).toBe(false);
	});

	it('package-hub External pivot: Exports rank by outbound under flow', () => {
		const categoryOrder = ['Export hop 2', 'Exports', 'External'];
		const links = [
			{ source: 'consumer-a', target: 'pkg', value: 30 },
			{ source: 'consumer-b', target: 'pkg', value: 5 },
			{ source: 'outer', target: 'consumer-a', value: 12 },
		];
		const nodeMeta = new Map([
			['outer', { category: 'Export hop 2', color: '#1' }],
			['consumer-a', { category: 'Exports', color: '#2' }],
			['consumer-b', { category: 'Exports', color: '#3' }],
			['pkg', { category: 'External', color: '#4' }],
		]);
		const facing = spineFacingBandMass(links, nodeMeta, categoryOrder);
		// left of External → outbound
		expect(facing.get('outer')).toBe(12);
		expect(facing.get('consumer-a')).toBe(30);
		expect(facing.get('consumer-b')).toBe(5);
		// External pivot → max(in, out) = 35
		expect(facing.get('pkg')).toBe(35);
	});

	it('non-hub fallback: no File/External → pure outbound / inbound', () => {
		const categoryOrder = ['Ends', 'Modules', 'Code'];
		const links = [
			{ source: 'a', target: 'mid', value: 10 },
			{ source: 'mid', target: 'b', value: 4 },
		];
		const nodeMeta = new Map([
			['a', { category: 'Ends', color: '#1' }],
			['mid', { category: 'Modules', color: '#2' }],
			['b', { category: 'Code', color: '#3' }],
		]);
		const facing = spineFacingBandMass(links, nodeMeta, categoryOrder);
		const away = spineAwayBandMass(links, nodeMeta, categoryOrder);
		expect(facing).toEqual(flowBandMass(links));
		expect(away).toEqual(flowTargetBandMass(links));
		expect(facing.get('a')).toBe(10);
		expect(facing.has('b')).toBe(false);
		expect(away.get('b')).toBe(4);
		expect(away.has('a')).toBe(false);
	});

	it('nodeBandMass uses file LOC; packages 0', () => {
		const graph = {
			contents: new Map([
				['big.ts', 'a\nb\nc\nd\ne\n'], // 5 lines
				['small.ts', 'x\n'], // 1 line
			]),
		} as unknown as import('@core/graph/types.ts').CodeGraph;
		const names = ['big.ts', 'small.ts', 'lodash', overflow];
		const nodeRef = {
			'big.ts': { kind: 'file' as const, id: 'big.ts' },
			'small.ts': { kind: 'file' as const, id: 'small.ts' },
			lodash: { kind: 'package' as const, id: 'lodash' },
		};
		const mass = nodeBandMass(names, nodeRef, graph);
		expect(mass.get('big.ts')).toBe(5);
		expect(mass.get('small.ts')).toBe(1);
		expect(mass.get('lodash')).toBe(0);
		expect(mass.has(overflow)).toBe(false);
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
		for (const mode of ['name', 'flow', 'flow-target', 'node'] as const) {
			const sorted = [...names].sort((a, b) =>
				compareAlluvialBands(a, b, {
					mode,
					mass,
					nodeRef,
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
			}),
		);
		expect(sorted).toEqual(['alpha.ts', 'mid.ts', 'zebra.ts']);
	});

	it('flow mode orders higher mass first (desc via compare)', () => {
		const names = ['light', 'heavy', 'mid'];
		const mass = new Map([
			['light', 1],
			['mid', 5],
			['heavy', 20],
		]);
		const sorted = [...names].sort((a, b) =>
			compareAlluvialBands(a, b, {
				mode: 'flow',
				mass,
				nodeRef: {},
			}),
		);
		expect(sorted).toEqual(['heavy', 'mid', 'light']);
	});

	it('buildAlluvialPayload flow: dual-side ranks Exports by out AND Imports by in', () => {
		const payload = buildAlluvialPayload({
			heightPx: 200,
			links: dualHub.links,
			nodeMeta: dualHub.nodeMeta,
			categoryOrder: [...dualHub.categoryOrder],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef: dualHub.nodeRef,
			startId: 'focus',
			bandSort: 'flow',
		});
		expect(payload).not.toBeNull();
		const exports = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Exports')
			.map((n) => n.name);
		const imports = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		// one mode, both sides correct (the bug fix)
		expect(exports).toEqual(['RootShell', 'session-exp', 'logger']);
		expect(imports).toEqual(['session-imp', 'SiteHeader', 'zod']);
		expect(payload!.meta.nodeRank!['RootShell']).toBe(0);
		expect(payload!.meta.nodeRank!['session-imp']).toBe(0);
	});

	it('buildAlluvialPayload flow-target inverts dual-side relative to flow', () => {
		// multi-hop so both sides have non-zero spine-away mass
		const categoryOrder = [
			'Export hop 2',
			'Exports',
			'File',
			'Imports',
			'Import hop 2',
		];
		const links = [
			{ source: 'outer-heavy', target: 'RootShell', value: 20 },
			{ source: 'outer-light', target: 'RootShell', value: 3 },
			{ source: 'RootShell', target: 'focus', value: 16 },
			{ source: 'focus', target: 'session', value: 10 },
			{ source: 'session', target: 'redis', value: 50 },
			{ source: 'session', target: 'types', value: 5 },
		];
		const nodeMeta = new Map([
			['outer-heavy', { category: 'Export hop 2', color: '#1' }],
			['outer-light', { category: 'Export hop 2', color: '#2' }],
			['RootShell', { category: 'Exports', color: '#3' }],
			['focus', { category: 'File', color: '#0' }],
			['session', { category: 'Imports', color: '#4' }],
			['redis', { category: 'Import hop 2', color: '#5' }],
			['types', { category: 'Import hop 2', color: '#6' }],
		]);
		const nodeRef = {
			'outer-heavy': { kind: 'file' as const, id: 'outer-heavy' },
			'outer-light': { kind: 'file' as const, id: 'outer-light' },
			RootShell: { kind: 'file' as const, id: 'RootShell' },
			focus: { kind: 'file' as const, id: 'focus' },
			session: { kind: 'file' as const, id: 'session' },
			redis: { kind: 'package' as const, id: 'redis' },
			types: { kind: 'file' as const, id: 'types' },
		};
		const flowPayload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder,
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef,
			bandSort: 'flow',
		})!;
		const awayPayload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder,
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef,
			bandSort: 'flow-target',
		})!;
		// flow (facing): Export hop free sources by out; Import hop pure sinks by in
		const flowHop2 = flowPayload.options.alluvial.nodes
			.filter((n) => n.category === 'Export hop 2')
			.map((n) => n.name);
		const flowImportHop = flowPayload.options.alluvial.nodes
			.filter((n) => n.category === 'Import hop 2')
			.map((n) => n.name);
		expect(flowHop2).toEqual(['outer-heavy', 'outer-light']);
		expect(flowImportHop).toEqual(['redis', 'types']);

		// flow-target (away): Export hop by in (both 0 → name); Exports by in;
		// Imports by out (session tops); Import hop by out (both 0 → name)
		const awayExports = awayPayload.options.alluvial.nodes
			.filter((n) => n.category === 'Exports')
			.map((n) => n.name);
		const awayImports = awayPayload.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		expect(awayExports).toEqual(['RootShell']); // in=23
		expect(awayImports).toEqual(['session']); // out=55
		// facing ranks RootShell by out=16; away by in=23 — both present; import hop
		// under facing uses in (redis 50 > types 5); under away out=0 → name
		const awayImportHop = awayPayload.options.alluvial.nodes
			.filter((n) => n.category === 'Import hop 2')
			.map((n) => n.name);
		expect(awayImportHop).toEqual(['redis', 'types']); // name tie
	});

	it('buildAlluvialPayload package-hub External pivot under flow', () => {
		const links = [
			{ source: 'consumer-a', target: 'pkg', value: 30 },
			{ source: 'consumer-b', target: 'pkg', value: 5 },
		];
		const nodeMeta = new Map([
			['consumer-a', { category: 'Exports', color: '#1' }],
			['consumer-b', { category: 'Exports', color: '#2' }],
			['pkg', { category: 'External', color: '#3' }],
		]);
		const payload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder: ['Exports', 'External'],
			focus: { kind: 'package', id: 'pkg', label: 'pkg' },
			nodeRef: {
				'consumer-a': { kind: 'file' as const, id: 'consumer-a' },
				'consumer-b': { kind: 'file' as const, id: 'consumer-b' },
				pkg: { kind: 'package' as const, id: 'pkg' },
			},
			bandSort: 'flow',
		})!;
		const exports = payload.options.alluvial.nodes
			.filter((n) => n.category === 'Exports')
			.map((n) => n.name);
		expect(exports).toEqual(['consumer-a', 'consumer-b']);
	});

	it('buildAlluvialPayload non-hub fallback uses pure outbound for flow', () => {
		const links = [
			{ source: 'zebra', target: 'code', value: 1 },
			{ source: 'alpha', target: 'code', value: 99 },
		];
		const nodeMeta = new Map([
			['zebra', { category: 'Ends', color: '#1' }],
			['alpha', { category: 'Ends', color: '#2' }],
			['code', { category: 'Code', color: '#0' }],
		]);
		const payload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder: ['Ends', 'Code'],
			focus: { kind: 'file', id: 'code', label: 'code' },
			nodeRef: {
				zebra: { kind: 'file' as const, id: 'zebra' },
				alpha: { kind: 'file' as const, id: 'alpha' },
				code: { kind: 'file' as const, id: 'code' },
			},
			bandSort: 'flow',
		})!;
		const ends = payload.options.alluvial.nodes
			.filter((n) => n.category === 'Ends')
			.map((n) => n.name);
		expect(ends).toEqual(['alpha', 'zebra']);
	});

	it('buildAlluvialPayload flow ranks free sources by outbound (overflow last)', () => {
		const links = [
			{ source: 'heavy', target: 'focus', value: 10 },
			{ source: 'light', target: 'focus', value: 1 },
			{ source: overflow, target: 'focus', value: 2 },
		];
		const nodeMeta = new Map([
			['focus', { category: 'File', color: '#0' }],
			['heavy', { category: 'Exports', color: '#1' }],
			['light', { category: 'Exports', color: '#2' }],
			[overflow, { category: 'Exports', color: '#3' }],
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
			categoryOrder: ['Exports', 'File'],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef,
			startId: 'focus',
			bandSort: 'flow',
		});
		expect(payload).not.toBeNull();
		const exports = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Exports')
			.map((n) => n.name);
		expect(exports).toEqual(['heavy', 'light', overflow]);
		expect(payload!.meta.nodeRank!['heavy']).toBe(0);
	});

	it('buildAlluvialPayload default flow ranks import leaves by inbound', () => {
		// spine-facing right-of-File uses inbound (not pure global outbound)
		const links = [
			{ source: 'focus', target: 'zebra', value: 1 },
			{ source: 'focus', target: 'alpha', value: 99 },
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
			categoryOrder: ['File', 'Imports'],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef: {
				focus: { kind: 'file', id: 'focus' },
				zebra: { kind: 'file', id: 'zebra' },
				alpha: { kind: 'file', id: 'alpha' },
			},
		});
		const imports = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		expect(imports).toEqual(['alpha', 'zebra']);
		expect(payload!.meta.nodeRank!['focus']).toBe(0);
	});

	it('buildAlluvialPayload node mode ranks by file LOC not link fatness', () => {
		const graph = {
			contents: new Map([
				['focus', 'f\n'],
				['small-fat', 'a\n'], // 1 LOC
				['big-thin', '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n'], // 10 LOC
			]),
		} as unknown as import('@core/graph/types.ts').CodeGraph;
		const links = [
			{ source: 'focus', target: 'small-fat', value: 99 },
			{ source: 'focus', target: 'big-thin', value: 1 },
		];
		const nodeMeta = new Map([
			['focus', { category: 'File', color: '#0' }],
			['small-fat', { category: 'Imports', color: '#1' }],
			['big-thin', { category: 'Imports', color: '#2' }],
		]);
		const nodeRef = {
			focus: { kind: 'file' as const, id: 'focus' },
			'small-fat': { kind: 'file' as const, id: 'small-fat' },
			'big-thin': { kind: 'file' as const, id: 'big-thin' },
		};
		// flow (spine-facing) ranks import leaves by inbound fatness
		const flowPayload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder: ['File', 'Imports'],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef,
			bandSort: 'flow',
			graph,
		})!;
		const nodePayload = buildAlluvialPayload({
			heightPx: 200,
			links,
			nodeMeta,
			categoryOrder: ['File', 'Imports'],
			focus: { kind: 'file', id: 'focus', label: 'focus' },
			nodeRef,
			bandSort: 'node',
			graph,
		})!;
		const flowOrder = flowPayload.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		const nodeOrder = nodePayload.options.alluvial.nodes
			.filter((n) => n.category === 'Imports')
			.map((n) => n.name);
		expect(flowOrder).toEqual(['small-fat', 'big-thin']);
		expect(nodeOrder).toEqual(['big-thin', 'small-fat']);
	});
});
