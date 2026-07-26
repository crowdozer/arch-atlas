import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { ingestZip } from '@core/ingest/zip.ts';
import {
	fileInDegree,
	fileOutDegree,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
import {
	isAlluvialRailName,
	isImportPadScaffoldLink,
	isOutRailName,
} from '@core/view/alluvial.ts';
import {
	exportHopCategory,
	importHopCategory,
	preferFileHubView,
	projectFileHub,
	type PackageLeafMode,
} from '@core/view/fileHub.ts';

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

/**
 * Mass at File (chart orientation):
 * - inMass / importerMass = reverse importers only
 * - outMass / depMass = focus → file deps + focus packages (File → package sinks)
 */
function hubIncidentMass(payload: AlluvialPayload, focusLabel: string): {
	inMass: number;
	outMass: number;
	total: number;
	depMass: number;
	importerMass: number;
} {
	const { out, inn } = flowTotals(payload.data);
	const inMass = inn.get(focusLabel) ?? 0;
	const outMass = out.get(focusLabel) ?? 0;
	return {
		inMass,
		outMass,
		total: inMass + outMass,
		importerMass: inMass,
		depMass: outMass,
	};
}

/** Focus out-edges to files only (export-side mass law). */
function fileOutFileDegree(
	graph: { edges: { from: string; toKind: string }[] },
	fileId: string,
): number {
	let n = 0;
	for (const e of graph.edges) {
		if (e.from === fileId && e.toKind === 'file') n += 1;
	}
	return n;
}

/**
 * True when `target` is reachable from `source` along payload links
 * (allows File → in-rail → External package pads).
 */
function linkPathExists(
	payload: AlluvialPayload,
	source: string,
	target: string,
): boolean {
	const adj = new Map<string, string[]>();
	for (const l of payload.data) {
		const list = adj.get(l.source) ?? [];
		list.push(l.target);
		adj.set(l.source, list);
	}
	const seen = new Set<string>([source]);
	const q = [source];
	while (q.length) {
		const cur = q.shift()!;
		if (cur === target) return true;
		for (const n of adj.get(cur) ?? []) {
			if (seen.has(n)) continue;
			seen.add(n);
			q.push(n);
		}
	}
	return false;
}

/** Focus out-edges to package/unresolved (import-side package mass). */
function fileOutPackageDegree(
	graph: { edges: { from: string; toKind: string }[] },
	fileId: string,
): number {
	let n = 0;
	for (const e of graph.edges) {
		if (e.from === fileId && (e.toKind === 'package' || e.toKind === 'unresolved')) {
			n += 1;
		}
	}
	return n;
}

function packageNodesOnCategory(
	payload: AlluvialPayload,
	pkgId: string,
	category: string | ((c: string) => boolean),
): { name: string; category: string }[] {
	const match =
		typeof category === 'function' ? category : (c: string) => c === category;
	return payload.options.alluvial.nodes
		.filter((n) => {
			const ref = payload.meta.nodeRef[n.name];
			return (
				ref?.kind === 'package' &&
				ref.id === pkgId &&
				match(n.category)
			);
		})
		.map((n) => ({ name: n.name, category: n.category }));
}

function assertPositiveLinks(payload: AlluvialPayload, label: string): void {
	for (const l of payload.data) {
		expect(l.value, `${label} ${l.source}→${l.target}`).toBeGreaterThan(0);
	}
}

function categories(payload: AlluvialPayload): Set<string> {
	return new Set(payload.options.alluvial.nodes.map((n) => n.category));
}

/**
 * Synthetic dual-chain hub:
 *
 *   farIn → midIn → focus → midOut → farOut
 *                         ↘ zod (package)
 */
function chainHubFiles(): VirtualFile[] {
	return [
		{
			path: 'farIn.ts',
			content: "import './midIn';\nexport const farIn = 1;\n",
			byteLength: 40,
		},
		{
			path: 'midIn.ts',
			content: "import './focus';\nexport const midIn = 1;\n",
			byteLength: 40,
		},
		{
			path: 'focus.ts',
			content:
				"import './midOut';\nimport 'zod';\nexport const focus = 1;\n",
			byteLength: 60,
		},
		{
			path: 'midOut.ts',
			content: "import './farOut';\nexport const midOut = 1;\n",
			byteLength: 40,
		},
		{
			path: 'farOut.ts',
			content: 'export const farOut = 1;\n',
			byteLength: 30,
		},
	];
}

describe('projectFileHub demo-next-complex', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('prefer hub when both in and out; pure sink stays reverse', () => {
		// redis is fan-in dominant with some outs
		const redis = 'src/lib/redis.ts';
		const inn = fileInDegree(graph, redis);
		const out = fileOutDegree(graph, redis);
		expect(inn).toBeGreaterThan(0);
		expect(out).toBeGreaterThan(0);
		expect(preferFileHubView(graph, redis)).toBe(true);

		// logger is pure sink
		const logger = 'src/lib/logger.ts';
		expect(fileOutDegree(graph, logger)).toBe(0);
		expect(fileInDegree(graph, logger)).toBeGreaterThan(0);
		expect(preferFileHubView(graph, logger)).toBe(false);
		expect(preferFileImportersView(graph, logger)).toBe(true);
	});

	it('hub mass equals reverse-in + file+package out for redis.ts', () => {
		const id = 'src/lib/redis.ts';
		const payload = projectFileHub(graph, id, { weightAxis: 'import-edges' });
		expect(payload).not.toBeNull();
		const focus = payload!.meta.focus.label;
		const { depMass, importerMass, total } = hubIncidentMass(payload!, focus);
		const pkgOut = fileOutPackageDegree(graph, id);
		const fileOut = fileOutFileDegree(graph, id);
		// reverse importers → File → file deps + packages
		expect(importerMass).toBe(fileInDegree(graph, id));
		expect(depMass).toBe(fileOut + pkgOut);
		expect(total).toBe(fileInDegree(graph, id) + fileOutDegree(graph, id));
		assertPositiveLinks(payload!, id);

		const cats = categories(payload!);
		expect(cats.has('Imports') || cats.has('External')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Import folders')).toBe(false);
		expect(payload!.options.alluvial.units).toBe('import edges');

		// Exports (consumers) column uses yellow family
		const depNodes = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports' || n.category.startsWith('Export hop'),
		);
		expect(depNodes.length).toBeGreaterThan(0);
		const scale = payload!.options.color.scale;
		for (const n of depNodes) {
			const c = scale[n.name] ?? '';
			expect(c, n.name).toMatch(/^#(?:eab308|ca8a04|a16207)$/i);
		}
	});

	it('depth=1 stays Imports/File/Exports; deeper depth adds hop columns when graph allows', () => {
		const id = 'src/lib/redis.ts';
		const edgeOpts = {
			weightAxis: 'import-edges' as const,
			maxImporters: 48,
			maxDeps: 48,
		};
		const shallow = projectFileHub(graph, id, { maxDepth: 1, ...edgeOpts })!;
		const shallowCats = categories(shallow);
		expect(shallowCats.has('Imports') || shallowCats.has('External')).toBe(true);
		expect(shallowCats.has('Exports')).toBe(true);
		expect(shallowCats.has('File')).toBe(true);
		// No multi-hop ring names at depth 1
		expect([...shallowCats].some((c) => c.startsWith('Import hop'))).toBe(false);
		expect([...shallowCats].some((c) => c.startsWith('Export hop'))).toBe(false);
		expect(shallowCats.has('Hop 1')).toBe(false);

		const focus = shallow.meta.focus.label;
		const shallowMass = hubIncidentMass(shallow, focus);
		const pkgOut = fileOutPackageDegree(graph, id);
		const fileOut = fileOutFileDegree(graph, id);
		expect(shallowMass.importerMass).toBe(fileInDegree(graph, id));
		expect(shallowMass.depMass).toBe(fileOut + pkgOut);

		for (const depth of [2, 3, 5] as const) {
			const deep = projectFileHub(graph, id, {
				maxDepth: depth,
				...edgeOpts,
			})!;
			const deepMass = hubIncidentMass(deep, deep.meta.focus.label);
			expect(deepMass.importerMass, `depth ${depth} importers`).toBe(
				fileInDegree(graph, id),
			);
			expect(deepMass.depMass, `depth ${depth} deps`).toBe(fileOut + pkgOut);
		}
	});

	it('returns null for missing file', () => {
		expect(projectFileHub(graph, 'nope/missing.ts')).toBeNull();
	});

	/**
	 * Observability for ghost pad-rail chrome (redis Import hop 2/3).
	 * No Carbon mount — gates payload contract only: rails exist for layout;
	 * terminators list padded free-source files (not rail ids).
	 */
	it('redis depth 3: pad rails exist; terminators are non-rail files in nodeRef', () => {
		const id = 'src/lib/redis.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			weightAxis: 'import-edges',
			maxImporters: 48,
			maxDeps: 48,
		})!;
		expect(payload).not.toBeNull();

		const nodeNames = payload.options.alluvial.nodes.map((n) => n.name);
		const linkNames = payload.data.flatMap((l) => [l.source, l.target]);
		const allNames = [...nodeNames, ...linkNames];
		const rails = allNames.filter((n) => isAlluvialRailName(n));
		// Reverse free-source pads now use out-rails (export-side consumers)
		expect(rails.length, 'expected pad rails at depth 3').toBeGreaterThan(0);
		expect(
			rails.some((r) => r.includes('out-rail') || r.includes('in-rail')),
			'pad rails present',
		).toBe(true);

		const terminators = payload.meta.terminators ?? [];
		expect(terminators.length, 'terminators non-empty for redis pads').toBeGreaterThan(
			0,
		);
		for (const t of terminators) {
			expect(isAlluvialRailName(t), `terminator must not be rail: ${t}`).toBe(
				false,
			);
			const ref = payload.meta.nodeRef[t];
			expect(ref, `terminator ${t} in nodeRef`).toBeTruthy();
			expect(ref!.kind, `terminator ${t} is a file`).toBe('file');
		}
	});

	it('redis cascade hard law: logger+ioredis Imports; consumers Exports', () => {
		const id = 'src/lib/redis.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			weightAxis: 'import-edges',
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const focus = payload.meta.focus.label;

		// Focus package ioredis on External (File → [rails] → package sink)
		const ioredis = packageNodesOnCategory(payload, 'ioredis', 'External');
		expect(ioredis).toHaveLength(1);
		expect(linkPathExists(payload, focus, ioredis[0]!.name)).toBe(true);
		expect(
			payload.data.some(
				(l) => l.source === ioredis[0]!.name && l.target === focus,
			),
		).toBe(false);

		// logger is the sole file out → Imports
		const loggerNodes = payload.options.alluvial.nodes.filter((n) => {
			const ref = payload.meta.nodeRef[n.name];
			return (
				ref?.kind === 'file' &&
				ref.id === 'src/lib/logger.ts' &&
				(n.category === 'Imports' || n.category.startsWith('Import hop'))
			);
		});
		expect(loggerNodes.length).toBeGreaterThanOrEqual(1);

		// Reverse importers on Exports
		const exportFiles = payload.options.alluvial.nodes.filter(
			(n) =>
				(n.category === 'Exports' || n.category.startsWith('Export hop')) &&
				payload.meta.nodeRef[n.name]?.kind === 'file',
		);
		expect(exportFiles.length).toBeGreaterThan(0);
		expect(
			payload.data.some(
				(l) =>
					exportFiles.some((f) => f.name === l.source) && l.target === focus,
			),
		).toBe(true);

		// ioredis never on export side
		const ioredisExport = packageNodesOnCategory(
			payload,
			'ioredis',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(ioredisExport).toHaveLength(0);
	});

	it('stripe route: next + tree packages on External; no packages on Export*', () => {
		const id = 'app/api/webhooks/stripe/route.ts';
		// importer-loc (UI default): residual package mass reaches types/* leaves
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			weightAxis: 'importer-loc',
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const focus = payload.meta.focus.label;

		// Focus package next on External (File → [rails] → package)
		const nextImport = packageNodesOnCategory(payload, 'next', 'External');
		expect(nextImport.length).toBeGreaterThanOrEqual(1);
		expect(linkPathExists(payload, focus, nextImport[0]!.name)).toBe(true);

		// Tree package zod on External (types → zod), not Export*
		const zodImport = packageNodesOnCategory(payload, 'zod', 'External');
		expect(zodImport.length).toBeGreaterThanOrEqual(1);
		expect(
			payload.data.some((l) => {
				if (l.target !== zodImport[0]!.name) return false;
				const ref = payload.meta.nodeRef[l.source];
				return (
					ref?.kind === 'file' &&
					typeof ref.id === 'string' &&
					ref.id.includes('types')
				);
			}),
		).toBe(true);

		// No package on export side
		for (const pkgId of ['next', 'zod'] as const) {
			const onExport = packageNodesOnCategory(
				payload,
				pkgId,
				(c) => c === 'Exports' || c.startsWith('Export hop'),
			);
			expect(onExport, pkgId).toHaveLength(0);
		}
		const anyExportPkg = payload.options.alluvial.nodes.filter(
			(n) =>
				(n.category === 'Exports' || n.category.startsWith('Export hop')) &&
				(payload.meta.nodeRef[n.name]?.kind === 'package' ||
					payload.meta.nodeRef[n.name]?.kind === 'unresolved'),
		);
		expect(anyExportPkg).toHaveLength(0);

		// File import cascade present (stripe deps on Imports)
		const importFiles = payload.options.alluvial.nodes.filter(
			(n) =>
				(n.category === 'Imports' || n.category.startsWith('Import hop')) &&
				payload.meta.nodeRef[n.name]?.kind === 'file',
		);
		expect(importFiles.length).toBeGreaterThan(0);
		const importIds = new Set(
			importFiles.map((n) => payload.meta.nodeRef[n.name]!.id),
		);
		expect(
			[...importIds].some(
				(fid) =>
					typeof fid === 'string' &&
					(fid.includes('stripe') ||
						fid.includes('orderService') ||
						fid.includes('billingService') ||
						fid.includes('logger')),
			),
		).toBe(true);

		// types/* → zod parents must not be free sources (residual law)
		const zodNames = new Set(
			packageNodesOnCategory(payload, 'zod', 'External').map((n) => n.name),
		);
		const targets = new Set(payload.data.map((l) => l.target));
		for (const l of payload.data) {
			if (!zodNames.has(l.target)) continue;
			const ref = payload.meta.nodeRef[l.source];
			if (ref?.kind !== 'file') continue;
			expect(
				targets.has(l.source),
				`${l.source}→zod must have inbound hub mass`,
			).toBe(true);
		}
	});
});

describe('projectFileHub dual-hop radius (synthetic chain)', () => {
	const { graph } = indexFiles(chainHubFiles());
	const focusId = 'focus.ts';

	it('depth=1 is classic three-column hub with focus-incident mass', () => {
		const payload = projectFileHub(graph, focusId, {
			maxDepth: 1,
			weightAxis: 'import-edges',
		})!;
		const cats = categories(payload);
		// External = focus package zod; Imports = file dep; Exports = reverse importer
		expect([...cats].sort()).toEqual([
			'Exports',
			'External',
			'File',
			'Imports',
		]);
		expect(cats.has('Import hop 2')).toBe(false);
		expect(cats.has('Export hop 2')).toBe(false);

		const focus = payload.meta.focus.label;
		expect(focus).toBe('focus.ts');
		const { depMass, importerMass, total } = hubIncidentMass(payload, focus);
		// midIn → File; File → midOut + zod
		expect(importerMass).toBe(1);
		expect(depMass).toBe(2);
		expect(total).toBe(fileInDegree(graph, focusId) + fileOutDegree(graph, focusId));
		assertPositiveLinks(payload, 'depth1');

		const intoFile = payload.data.filter((l) => l.target === focus);
		const fromFile = payload.data.filter((l) => l.source === focus);
		expect(intoFile).toHaveLength(1); // midIn
		expect(fromFile.length).toBe(2); // midOut + zod

		// zod External: File → [rails] → package (sink; one hop past file Imports)
		const zodImport = packageNodesOnCategory(payload, 'zod', 'External');
		expect(zodImport).toHaveLength(1);
		expect(linkPathExists(payload, focus, zodImport[0]!.name)).toBe(true);
	});

	it('depth=3 shows Import hop 2 and Export hop 2 with conserved File mass', () => {
		const payload = projectFileHub(graph, focusId, {
			maxDepth: 3,
			weightAxis: 'import-edges',
		})!;
		const cats = categories(payload);
		expect(cats.has('Import hop 2')).toBe(true);
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Export hop 2')).toBe(true);
		// Chain is only 2 hops each way — no hop 3
		expect(cats.has('Import hop 3')).toBe(false);
		expect(cats.has('Export hop 3')).toBe(false);

		const order = payload.options.alluvial.nodes
			.map((n) => n.category)
			.filter((c, i, arr) => arr.indexOf(c) === i);
		// L→R: Export hop … → Exports → File → Imports → Import hop …
		expect(order.indexOf('Export hop 2')).toBeLessThan(order.indexOf('Exports'));
		expect(order.indexOf('Exports')).toBeLessThan(order.indexOf('File'));
		expect(order.indexOf('File')).toBeLessThan(order.indexOf('Imports'));
		expect(order.indexOf('Imports')).toBeLessThan(order.indexOf('Import hop 2'));

		const focus = payload.meta.focus.label;
		const { depMass, importerMass, total } = hubIncidentMass(payload, focus);
		expect(importerMass).toBe(fileInDegree(graph, focusId));
		expect(depMass).toBe(
			fileOutFileDegree(graph, focusId) + fileOutPackageDegree(graph, focusId),
		);
		expect(total).toBe(fileInDegree(graph, focusId) + fileOutDegree(graph, focusId));
		assertPositiveLinks(payload, 'depth3');

		const hop2ImportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Import hop 2',
		);
		const hop2ExportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Export hop 2',
		);
		expect(hop2ImportNodes.length).toBeGreaterThan(0);
		expect(hop2ExportNodes.length).toBeGreaterThan(0);

		// Focus package on External (teal package), not Exports yellow
		const scale = payload.options.color.scale;
		const zodImport = packageNodesOnCategory(payload, 'zod', 'External');
		expect(zodImport).toHaveLength(1);
		expect(scale[zodImport[0]!.name] ?? '').toBe('#0d9488'); // TEAL.package
		const exportZod = packageNodesOnCategory(
			payload,
			'zod',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(exportZod).toHaveLength(0);
		for (const n of hop2ExportNodes) {
			expect(scale[n.name] ?? '').toMatch(/^#(?:eab308|ca8a04|a16207)$/i);
		}
	});

	it('category helpers name dist-1 vs outer rings (internal build tags)', () => {
		expect(importHopCategory(1)).toBe('Imports');
		expect(importHopCategory(2)).toBe('Import hop 2');
		expect(exportHopCategory(1)).toBe('Exports');
		expect(exportHopCategory(3)).toBe('Export hop 3');
	});
});

/**
 * Longest-path layers (Carbon/d3-sankey column proxy) for **file/rail** rings.
 * Each layer must carry a single import/export category family so headers
 * never show "Imports Imports File …".
 *
 * Package/unresolved free sources on Imports (focus + export-tree packages)
 * are excluded — they share free-source depth with reverse free sources by
 * design (category columns still place them under Imports).
 */
function longestPathLayers(payload: AlluvialPayload): Map<number, Set<string>> {
	const isPackageLike = (name: string): boolean => {
		const ref = payload.meta.nodeRef[name];
		if (!ref) return false;
		if (ref.kind === 'package' || ref.kind === 'unresolved') return true;
		if (
			ref.kind === 'bucket' &&
			(ref.id.includes('pkg') || ref.id.includes('import-tree'))
		) {
			return true;
		}
		return false;
	};
	const names = new Set(
		payload.options.alluvial.nodes
			.map((n) => n.name)
			.filter((n) => !isPackageLike(n)),
	);
	const catOf = new Map(
		payload.options.alluvial.nodes.map((n) => [n.name, n.category] as const),
	);
	const ins = new Map<string, string[]>();
	for (const l of payload.data) {
		if (isPackageLike(l.source) || isPackageLike(l.target)) continue;
		if (!names.has(l.target) || !names.has(l.source)) continue;
		const list = ins.get(l.target) ?? [];
		list.push(l.source);
		ins.set(l.target, list);
	}
	const memo = new Map<string, number>();
	const depth = (n: string, stack: Set<string> = new Set()): number => {
		if (memo.has(n)) return memo.get(n)!;
		if (stack.has(n)) return 0;
		stack.add(n);
		const preds = ins.get(n) ?? [];
		const d = !preds.length
			? 0
			: 1 + Math.max(...preds.map((p) => depth(p, stack)));
		stack.delete(n);
		memo.set(n, d);
		return d;
	};
	for (const n of names) depth(n);
	const byLayer = new Map<number, Set<string>>();
	for (const [n, d] of memo) {
		const cat = catOf.get(n);
		if (!cat) continue;
		const set = byLayer.get(d) ?? new Set();
		set.add(cat);
		byLayer.set(d, set);
	}
	return byLayer;
}

describe('projectFileHub export longest-path (demo-react-simple)', () => {
	const { graph: simpleGraph } = indexFiles(
		walk(path.join(fixturesRoot, 'demo-react-simple')),
	);

	it('UserCard: seed deps on Imports; types→zod External', () => {
		const id = 'src/components/UserCard.tsx';
		const payload = projectFileHub(simpleGraph, id, {
			maxDepth: 3,
			maxDeps: 48,
			maxImporters: 48,
			weightAxis: 'import-edges',
		})!;
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		// format + types are both direct seeds → Imports (not hop 2 pad)
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('External')).toBe(true);

		const focus = payload.meta.focus.label;
		const { depMass, importerMass, total } = hubIncidentMass(payload, focus);
		expect(importerMass).toBe(fileInDegree(simpleGraph, id));
		expect(depMass).toBe(
			fileOutFileDegree(simpleGraph, id) + fileOutPackageDegree(simpleGraph, id),
		);
		expect(total).toBe(
			fileInDegree(simpleGraph, id) + fileOutDegree(simpleGraph, id),
		);

		// Direct File → format, File → types
		expect(
			payload.data.some(
				(l) => l.source === focus && l.target.includes('format'),
			),
		).toBe(true);
		expect(
			payload.data.some(
				(l) => l.source === focus && l.target.includes('types'),
			),
		).toBe(true);

		// types → zod External
		const treeZod = packageNodesOnCategory(payload, 'zod', 'External');
		expect(treeZod).toHaveLength(1);
		const typesLab = payload.options.alluvial.nodes.find((n) => {
			const ref = payload.meta.nodeRef[n.name];
			return ref?.kind === 'file' && ref.id === 'src/types.ts';
		})?.name;
		expect(typesLab).toBeTruthy();
		expect(categoryOfTypes(payload, typesLab!)).toBe('Imports');
		expect(
			payload.data.some(
				(l) => l.source === typesLab && l.target === treeZod[0]!.name,
			),
		).toBe(true);
		const exportZod = packageNodesOnCategory(
			payload,
			'zod',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(exportZod).toHaveLength(0);
	});

	function categoryOfTypes(payload: AlluvialPayload, name: string): string | undefined {
		return payload.options.alluvial.nodes.find((n) => n.name === name)?.category;
	}

	function packageNodes(
		payload: AlluvialPayload,
		pkgId: string,
	): { name: string; category: string }[] {
		return payload.options.alluvial.nodes
			.filter((n) => {
				const ref = payload.meta.nodeRef[n.name];
				return ref?.kind === 'package' && ref.id === pkgId;
			})
			.map((n) => ({ name: n.name, category: n.category }));
	}

	/** File→file / hop edges must not share a category; package→file on Imports may. */
	function assertNoSameCategoryFileEdges(payload: AlluvialPayload): void {
		const catOf = new Map(
			payload.options.alluvial.nodes.map((n) => [n.name, n.category] as const),
		);
		for (const l of payload.data) {
			const sk = payload.meta.nodeRef[l.source]?.kind;
			const tk = payload.meta.nodeRef[l.target]?.kind;
			if (sk === 'package' || sk === 'unresolved' || tk === 'package' || tk === 'unresolved') {
				continue;
			}
			if (isAlluvialRailName(l.source) || isAlluvialRailName(l.target)) continue;
			expect(
				catOf.get(l.source),
				`${l.source} → ${l.target}`,
			).not.toBe(catOf.get(l.target));
		}
	}

	it('main.tsx pin-clip: focus packages on External; no export package leaves', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			maxImporters: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-clip',
		})!;
		assertNoSameCategoryFileEdges(payload);

		// Focus packages live under External
		const rrdImport = packageNodesOnCategory(payload, 'react-router-dom', 'External');
		const reactImport = packageNodesOnCategory(payload, 'react', 'External');
		expect(rrdImport.length).toBeGreaterThanOrEqual(1);
		expect(reactImport.length).toBeGreaterThanOrEqual(1);
		expect(rrdImport[0]!.name).toBe('react-router-dom');
		expect(reactImport[0]!.name).toBe('react');

		// Cascade purity: no package nodes on Exports / Export hop *
		const rrdExport = packageNodesOnCategory(
			payload,
			'react-router-dom',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		const reactExport = packageNodesOnCategory(
			payload,
			'react',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(rrdExport).toHaveLength(0);
		expect(reactExport).toHaveLength(0);
	});

	it('main.tsx pin-overdraw: focus on Imports; no export package leaves', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-overdraw',
		})!;
		assertNoSameCategoryFileEdges(payload);

		const reactImport = packageNodesOnCategory(payload, 'react', 'External');
		expect(reactImport).toHaveLength(1);
		expect(reactImport[0]!.name).toBe('react');

		const reactExport = packageNodesOnCategory(
			payload,
			'react',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(reactExport).toHaveLength(0);
		const rrdExport = packageNodesOnCategory(
			payload,
			'react-router-dom',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(rrdExport).toHaveLength(0);

		// File import tree still present (App etc. on Imports)
		const importFiles = payload.options.alluvial.nodes.filter(
			(n) =>
				(n.category === 'Imports' || n.category.startsWith('Import hop')) &&
				payload.meta.nodeRef[n.name]?.kind === 'file',
		);
		expect(importFiles.length).toBeGreaterThan(0);
	});

	it('main.tsx per-hop: focus package on Imports only; export side file-pure', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'per-hop',
		})!;
		assertNoSameCategoryFileEdges(payload);

		const rrdImport = packageNodesOnCategory(payload, 'react-router-dom', 'External');
		expect(rrdImport.length).toBeGreaterThanOrEqual(1);

		const rrd = packageNodes(payload, 'react-router-dom');
		// Only External copy — no structural export package leaves
		expect(rrd).toHaveLength(1);
		expect(rrd[0]!.category).toBe('External');
	});

	it('main.tsx pin-clip depth=1: focus packages on External (not Exports)', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 1,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-clip',
		})!;
		const importRrd = packageNodesOnCategory(payload, 'react-router-dom', 'External');
		expect(importRrd).toHaveLength(1);
		expect(importRrd[0]!.name).toBe('react-router-dom');
		// Focus mass: File → [rails] → package (External sink)
		expect(
			linkPathExists(payload, payload.meta.focus.label, importRrd[0]!.name),
		).toBe(true);
		// No export package leaves; no overdraw columns at depth 1
		const exportRrd = packageNodesOnCategory(
			payload,
			'react-router-dom',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(exportRrd).toHaveLength(0);
		expect(
			payload.options.alluvial.nodes.some((n) =>
				n.category.startsWith('Export hop'),
			),
		).toBe(false);
	});

	it('main.tsx pin-overdraw depth=1: focus on Imports; no intermediate package overdraw', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 1,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-overdraw',
		})!;
		const rrdImport = packageNodesOnCategory(payload, 'react-router-dom', 'External');
		expect(rrdImport).toHaveLength(1);
		expect(rrdImport[0]!.name).toBe('react-router-dom');

		// File-pure cascade: no package pin columns past Depth
		const rrdExport = packageNodesOnCategory(
			payload,
			'react-router-dom',
			(c) => c === 'Exports' || c.startsWith('Export hop'),
		);
		expect(rrdExport).toHaveLength(0);
		expect(
			payload.options.alluvial.nodes.some((n) =>
				n.category.startsWith('Export hop'),
			),
		).toBe(false);
	});

	it('pin-far modes: no · in/out hN on file labels', () => {
		for (const mode of ['pin-clip', 'pin-overdraw'] as const) {
			const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
				maxDepth: 3,
				maxDeps: 48,
				weightAxis: 'importer-loc',
				packageLeafMode: mode,
			})!;
			for (const n of payload.options.alluvial.nodes) {
				// Rails / zero-width pads may exist; skip pure buckets without labels
				if (n.name.includes('\u200b')) continue;
				expect(n.name, `${mode} ${n.category} ${n.name}`).not.toMatch(
					/ · (?:in|out)(?: h\d+)?$/,
				);
				expect(n.name, `${mode} ${n.name}`).not.toMatch(/ · (?:in|out) h\d+/);
			}
		}
	});

	it('per-hop suffixes multi-hop file labels (not package leaves)', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'per-hop',
		})!;
		const hopFiles = payload.options.alluvial.nodes.filter(
			(n) =>
				(n.category.startsWith('Export hop') ||
					n.category.startsWith('Import hop')) &&
				payload.meta.nodeRef[n.name]?.kind === 'file',
		);
		expect(hopFiles.some((n) => / · (?:in|out) h\d+/.test(n.name))).toBe(true);
		// Still no export-side packages under per-hop
		const exportPkgs = payload.options.alluvial.nodes.filter(
			(n) =>
				(n.category === 'Exports' || n.category.startsWith('Export hop')) &&
				payload.meta.nodeRef[n.name]?.kind === 'package',
		);
		expect(exportPkgs).toHaveLength(0);
	});

	it('resolvePackageLeafMode accepts the three modes', () => {
		const modes: PackageLeafMode[] = ['pin-overdraw', 'pin-clip', 'per-hop'];
		for (const m of modes) {
			expect(
				projectFileHub(simpleGraph, 'src/main.tsx', {
					maxDepth: 2,
					packageLeafMode: m,
				}),
			).not.toBeNull();
		}
	});
});

describe('projectFileHub layer-consistent import headers (demo-next-complex)', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('userService: seeds on Imports; non-seed hops expand; External packages', () => {
		const id = 'src/services/userService.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const cats = categories(payload);
		expect(cats.has('Imports')).toBe(true);
		// May or may not have hop 2 depending on non-seed reachability
		expect(cats.has('File')).toBe(true);
		// No dual Imports headers in node list
		const importNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		);
		expect(importNodes.length).toBeGreaterThan(0);
	});

	it('legacyHelpers: all direct file deps on Imports; packages External far right', () => {
		const id = 'src/utils/legacyHelpers.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const nodeCats = categories(payload);
		// All file outs are seeds → Imports only (no hop rails for dual-path)
		expect(nodeCats.has('Imports')).toBe(true);
		expect(nodeCats.has('External')).toBe(true);
		const order = payload.options.alluvial.nodes
			.map((n) => n.category)
			.filter((c, i, a) => a.indexOf(c) === i);
		expect(order.indexOf('File')).toBeLessThan(order.indexOf('Imports'));
		expect(order.indexOf('Imports')).toBeLessThan(order.indexOf('External'));
		expect(order[order.length - 1], 'External is far-right column').toBe(
			'External',
		);
		// Consumers left of File
		expect(order.indexOf('Exports')).toBeLessThan(order.indexOf('File'));

		const focus = payload.meta.focus.label;
		// Direct File → logger (seed clamp; not shared invisible rail)
		expect(
			payload.data.some(
				(l) =>
					l.source === focus &&
					l.target.includes('logger') &&
					!isAlluvialRailName(l.target),
			),
		).toBe(true);

		const externalPkgs = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'External',
		);
		expect(externalPkgs.length).toBeGreaterThan(0);
		expect(
			externalPkgs.every((n) => {
				const k = payload.meta.nodeRef[n.name]?.kind;
				return k === 'package' || k === 'unresolved' || k === 'bucket';
			}),
		).toBe(true);
		// No packages on file import hops
		for (const n of payload.options.alluvial.nodes) {
			if (n.category !== 'Imports' && !n.category.startsWith('Import hop')) {
				continue;
			}
			const k = payload.meta.nodeRef[n.name]?.kind;
			expect(k, `${n.name} on ${n.category}`).not.toBe('package');
		}
		const fileNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'File',
		);
		expect(fileNodes).toHaveLength(1);
		expect(fileNodes[0]!.name).toBe(id);
	});
});

describe('projectFileHub hop overflow and folder collapse', () => {
	/**
	 * Wide export hop-2 fan-out:
	 *   left → focus → m0, m1 → (3 children each = 6 hop-2 files)
	 * maxDeps=2 keeps 2 hop-2 leaves; overflow bucket must carry mass.
	 */
	function wideExportHopFiles(): VirtualFile[] {
		const files: VirtualFile[] = [
			{
				path: 'left.ts',
				content: "import './focus';\nexport const left = 1;\n",
				byteLength: 40,
			},
			{
				path: 'focus.ts',
				content:
					"import './m0';\nimport './m1';\nexport const focus = 1;\n",
				byteLength: 50,
			},
		];
		for (const mid of ['m0', 'm1']) {
			const kids = ['a', 'b', 'c'].map((k) => `./${mid}${k}`);
			files.push({
				path: `${mid}.ts`,
				content:
					kids.map((k) => `import '${k}';`).join('\n') +
					`\nexport const ${mid} = 1;\n`,
				byteLength: 80,
			});
			for (const k of ['a', 'b', 'c']) {
				const name = `${mid}${k}`;
				files.push({
					path: `${name}.ts`,
					content: `export const ${name} = 1;\n`,
					byteLength: 30,
				});
			}
		}
		return files;
	}

	it('import hop≥2 overflow bucket receives positive mass under small maxDeps', () => {
		const { graph } = indexFiles(wideExportHopFiles());
		const payload = projectFileHub(graph, 'focus.ts', {
			maxDepth: 2,
			maxDeps: 2,
			maxImporters: 8,
			weightAxis: 'import-edges',
		})!;
		const cats = categories(payload);
		// Outbound wide fan lives on Import hops under hard law
		expect(cats.has('Import hop 2')).toBe(true);

		const hop2Nodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Import hop 2',
		);
		const overflow = hop2Nodes.find((n) => n.name.includes('more'));
		expect(overflow, 'expected +N more on Import hop 2').toBeTruthy();

		const { out, inn } = flowTotals(payload.data);
		const incident =
			(out.get(overflow!.name) ?? 0) + (inn.get(overflow!.name) ?? 0);
		expect(incident, overflow!.name).toBeGreaterThan(0);

		// Dep mass matches focus file→file out-degree
		const focus = payload.meta.focus.label;
		const { depMass } = hubIncidentMass(payload, focus);
		expect(depMass).toBe(fileOutFileDegree(graph, 'focus.ts'));
	});

	/**
	 * Fan-in > FILE_PROMOTE_THRESHOLD (12): depth=1 collapses to module leaves;
	 * depth=3 uses file leaves (no folder collapse).
	 */
	function fanInHubFiles(): VirtualFile[] {
		const files: VirtualFile[] = [
			{
				path: 'focus.ts',
				content: "import './out';\nexport const focus = 1;\n",
				byteLength: 40,
			},
			{
				path: 'out.ts',
				content: 'export const out = 1;\n',
				byteLength: 25,
			},
		];
		for (let i = 0; i < 13; i++) {
			const id = String(i).padStart(2, '0');
			files.push({
				path: `src/mod/imp${id}.ts`,
				content: "import '../../focus';\nexport const x = 1;\n",
				byteLength: 45,
			});
		}
		return files;
	}

	it('folder collapse only at maxDepth 1; depth 3 keeps file leaves', () => {
		const { graph } = indexFiles(fanInHubFiles());
		const shallow = projectFileHub(graph, 'focus.ts', {
			maxDepth: 1,
			maxModules: 8,
			maxImporters: 48,
			weightAxis: 'import-edges',
		})!;
		const deep = projectFileHub(graph, 'focus.ts', {
			maxDepth: 3,
			maxModules: 8,
			maxImporters: 48,
			weightAxis: 'import-edges',
		})!;

		// depth=1: module refs on Exports (reverse fan-in folder collapse)
		const shallowExportNodes = shallow.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports',
		);
		expect(shallowExportNodes.length).toBeGreaterThan(0);
		const shallowKinds = shallowExportNodes.map(
			(n) => shallow.meta.nodeRef[n.name]?.kind,
		);
		expect(shallowKinds.some((k) => k === 'module')).toBe(true);
		expect(shallowKinds.every((k) => k === 'module' || k === 'bucket')).toBe(
			true,
		);

		// depth=3: reverse file leaves on Exports (no module collapse)
		const deepExportNodes = deep.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports' || n.category.startsWith('Export hop'),
		);
		const deepKinds = deepExportNodes.map((n) => deep.meta.nodeRef[n.name]?.kind);
		expect(deepKinds.some((k) => k === 'file')).toBe(true);
		expect(deepKinds.every((k) => k !== 'module')).toBe(true);

		// Mass conserved both depths
		for (const p of [shallow, deep]) {
			const { depMass, importerMass } = hubIncidentMass(p, p.meta.focus.label);
			expect(importerMass).toBe(13);
			expect(depMass).toBe(1);
		}
	});
});

describe('projectFileHub focus packages on External', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	it('app/api/users/route.ts: next is External with File→package link, not Exports', () => {
		const id = 'app/api/users/route.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			maxDeps: 48,
			maxImporters: 48,
			weightAxis: 'import-edges',
		})!;
		expect(payload).not.toBeNull();

		const nextNodes = payload.options.alluvial.nodes.filter((n) => {
			const ref = payload.meta.nodeRef[n.name];
			return ref?.kind === 'package' && ref.id === 'next';
		});
		expect(nextNodes.length).toBeGreaterThanOrEqual(1);
		// Focus package next must be on Imports
		const nextImport = nextNodes.filter((n) => n.category === 'External');
		expect(nextImport).toHaveLength(1);
		// Not on export-side categories as a focus leaf
		const nextExport = nextNodes.filter(
			(n) => n.category === 'Exports' || n.category.startsWith('Export hop'),
		);
		expect(nextExport).toHaveLength(0);

		const focus = payload.meta.focus.label;
		expect(linkPathExists(payload, focus, nextImport[0]!.name)).toBe(true);
		// package→File must not be the display orientation (sink External)
		expect(
			payload.data.some(
				(l) => l.source === nextImport[0]!.name && l.target === focus,
			),
		).toBe(false);

		// Mass law: package weight on File in; file deps on File out
		const { depMass, importerMass, total } = hubIncidentMass(payload, focus);
		expect(importerMass).toBe(fileInDegree(graph, id));
		expect(depMass).toBe(
			fileOutFileDegree(graph, id) + fileOutPackageDegree(graph, id),
		);
		expect(total).toBe(fileInDegree(graph, id) + fileOutDegree(graph, id));
		// API route has no reverse importers — no Exports; packages+file deps on Imports
		expect(fileInDegree(graph, id)).toBe(0);
		expect(categories(payload).has('Imports')).toBe(true);
		expect(categories(payload).has('Exports')).toBe(false);
	});
});

describe('projectFileHub artillery public.ts barrel', () => {
	it('shows 64-edge hub (25 in + 39 out) without package placeholder', () => {
		let buf: Buffer;
		try {
			buf = readFileSync(path.join(process.cwd(), '.grok/artillery.zip'));
		} catch {
			return;
		}
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const { files } = ingestZip(ab);
		const { graph, catalog } = indexFiles(files);
		const id = 'client/sim/public.ts';
		const hot = catalog.hotspots.find((h) => h.id === id);
		expect(hot, 'public.ts should be a hotspot').toBeTruthy();
		expect(hot!.edgeCount).toBe(hot!.outDegree + hot!.inDegree);
		expect(preferFileHubView(graph, id)).toBe(true);

		const payload = projectFileHub(graph, id, { weightAxis: 'import-edges' })!;
		const focus = payload.meta.focus.label;
		const { depMass, importerMass, total } = hubIncidentMass(payload, focus);
		const pkgOut = fileOutPackageDegree(graph, id);
		const fileOut = fileOutFileDegree(graph, id);
		expect(importerMass).toBe(hot!.inDegree);
		expect(depMass).toBe(fileOut + pkgOut);
		expect(total).toBe(hot!.edgeCount);

		// No synthetic package placeholder
		const names = payload.options.alluvial.nodes.map((n) => n.name);
		expect(names).not.toContain('(no package imports)');
		expect(payload.data.every((l) => l.value >= 1)).toBe(true);

		// Pure reverse would only show the in side
		const rev = projectFileImporters(graph, id, { weightAxis: 'import-edges' })!;
		const revFocusOut = flowTotals(rev.data).out.get(rev.meta.focus.label) ?? 0;
		expect(total).toBeGreaterThan(revFocusOut);
	});
});
