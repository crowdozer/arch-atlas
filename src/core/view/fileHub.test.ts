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
import { isAlluvialRailName } from '@core/view/alluvial.ts';
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
 * Mass at File (import-edge orientation: importers → File → deps):
 * - inMass / importerMass = who imports focus = file in-degree
 * - outMass / depMass = what focus imports = file out-degree
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

	it('hub mass equals importer + dep edge weights for redis.ts', () => {
		const id = 'src/lib/redis.ts';
		const payload = projectFileHub(graph, id, { weightAxis: 'import-edges' });
		expect(payload).not.toBeNull();
		const focus = payload!.meta.focus.label;
		const { depMass, importerMass, total } = hubIncidentMass(payload!, focus);
		// importers → File → deps
		expect(importerMass).toBe(fileInDegree(graph, id));
		expect(depMass).toBe(fileOutDegree(graph, id));
		expect(total).toBe(depMass + importerMass);
		assertPositiveLinks(payload!, id);

		const cats = categories(payload!);
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('File')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Import folders')).toBe(false);
		expect(payload!.options.alluvial.units).toBe('import edges');

		// Exports (dep) column uses yellow family
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
		expect(shallowCats.has('Imports')).toBe(true);
		expect(shallowCats.has('Exports')).toBe(true);
		expect(shallowCats.has('File')).toBe(true);
		// No multi-hop ring names at depth 1
		expect([...shallowCats].some((c) => c.startsWith('Import hop'))).toBe(false);
		expect([...shallowCats].some((c) => c.startsWith('Import hop'))).toBe(false);
		expect(shallowCats.has('Hop 1')).toBe(false);

		const focus = shallow.meta.focus.label;
		const shallowMass = hubIncidentMass(shallow, focus);
		expect(shallowMass.importerMass).toBe(fileInDegree(graph, id));
		expect(shallowMass.depMass).toBe(fileOutDegree(graph, id));

		for (const depth of [2, 3, 5] as const) {
			const deep = projectFileHub(graph, id, {
				maxDepth: depth,
				...edgeOpts,
			})!;
			const deepMass = hubIncidentMass(deep, deep.meta.focus.label);
			expect(deepMass.importerMass, `depth ${depth} importers`).toBe(
				fileInDegree(graph, id),
			);
			expect(deepMass.depMass, `depth ${depth} deps`).toBe(fileOutDegree(graph, id));
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
		expect(rails.length, 'expected import pad rails at depth 3').toBeGreaterThan(0);
		expect(
			rails.some((r) => r.includes('in-rail')),
			'import-side rails',
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
		expect([...cats].sort()).toEqual(['Exports', 'File', 'Imports']);
		expect(cats.has('Import hop 2')).toBe(false);
		expect(cats.has('Export hop 2')).toBe(false);

		const focus = payload.meta.focus.label;
		expect(focus).toBe('focus.ts');
		const { depMass, importerMass } = hubIncidentMass(payload, focus);
		expect(importerMass).toBe(1); // midIn → focus
		expect(depMass).toBe(2); // focus → midOut + zod
		assertPositiveLinks(payload, 'depth1');

		// importers → File → deps
		const intoFile = payload.data.filter((l) => l.target === focus);
		const fromFile = payload.data.filter((l) => l.source === focus);
		expect(intoFile).toHaveLength(1);
		expect(fromFile.length).toBe(2);
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
		// Category order: Import hops → Imports → File → Exports → Export hops
		expect(order.indexOf('Import hop 2')).toBeLessThan(order.indexOf('Imports'));
		expect(order.indexOf('Imports')).toBeLessThan(order.indexOf('File'));
		expect(order.indexOf('File')).toBeLessThan(order.indexOf('Exports'));
		expect(order.indexOf('Exports')).toBeLessThan(order.indexOf('Export hop 2'));

		const focus = payload.meta.focus.label;
		const { depMass, importerMass } = hubIncidentMass(payload, focus);
		expect(importerMass).toBe(fileInDegree(graph, focusId));
		expect(depMass).toBe(fileOutDegree(graph, focusId));
		assertPositiveLinks(payload, 'depth3');

		const hop2ImportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Import hop 2',
		);
		const hop2ExportNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Export hop 2',
		);
		expect(hop2ImportNodes.length).toBeGreaterThan(0);
		expect(hop2ExportNodes.length).toBeGreaterThan(0);

		// Package stays on Exports (dist-1 deps), yellow
		const scale = payload.options.color.scale;
		const depNodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Exports',
		);
		const depNames = depNodes.map((n) => n.name);
		expect(depNames.some((n) => n === 'zod' || n.includes('zod'))).toBe(true);
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
 * Longest-path layers (Carbon/d3-sankey column proxy).
 * Each layer must carry a single import/export category family so headers
 * never show "Imports Imports File …".
 */
function longestPathLayers(payload: AlluvialPayload): Map<number, Set<string>> {
	const names = new Set(payload.options.alluvial.nodes.map((n) => n.name));
	const catOf = new Map(
		payload.options.alluvial.nodes.map((n) => [n.name, n.category] as const),
	);
	const ins = new Map<string, string[]>();
	for (const l of payload.data) {
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

	it('UserCard shows format → types → zod as export hops', () => {
		const id = 'src/components/UserCard.tsx';
		const payload = projectFileHub(simpleGraph, id, {
			maxDepth: 3,
			maxDeps: 48,
			maxImporters: 48,
			weightAxis: 'import-edges',
		})!;
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Export hop 2')).toBe(true);
		expect(cats.has('Export hop 3')).toBe(true);

		const names = payload.options.alluvial.nodes.map((n) => n.name);
		expect(names.some((n) => n.includes('format'))).toBe(true);
		expect(names.some((n) => n.includes('types'))).toBe(true);
		expect(names.some((n) => n.includes('zod'))).toBe(true);

		// Import-edge chain: File → format → types → zod
		const linkKeys = payload.data.map((l) => `${l.source}→${l.target}`);
		expect(
			linkKeys.some(
				(k) => k.includes('format') && k.includes('types'),
			),
		).toBe(true);
		expect(linkKeys.some((k) => k.includes('types') && k.includes('zod'))).toBe(
			true,
		);
		// Direction: types → zod (types imports zod)
		expect(
			linkKeys.some((k) => k.includes('types') && k.includes('→zod')),
		).toBe(true);

		const focus = payload.meta.focus.label;
		const { depMass } = hubIncidentMass(payload, focus);
		expect(depMass).toBe(fileOutDegree(simpleGraph, id));
	});

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

	function assertNoSameCategoryEdges(payload: AlluvialPayload): void {
		const catOf = new Map(
			payload.options.alluvial.nodes.map((n) => [n.name, n.category] as const),
		);
		for (const l of payload.data) {
			expect(
				catOf.get(l.source),
				`${l.source} → ${l.target}`,
			).not.toBe(catOf.get(l.target));
		}
	}

	it('main.tsx pin-clip: one react-router-dom and one react; no same-category edges', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			maxImporters: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-clip',
		})!;
		assertNoSameCategoryEdges(payload);

		const rrd = packageNodes(payload, 'react-router-dom');
		const react = packageNodes(payload, 'react');
		expect(rrd).toHaveLength(1);
		expect(react).toHaveLength(1);
		// Clipped to Depth 3 — both pin at hop 3 (not multi-hop clones)
		expect(rrd[0]!.category).toBe('Export hop 3');
		expect(react[0]!.category).toBe('Export hop 3');
		// Pin-far labels stay plain (hop is column category only)
		expect(rrd[0]!.name).toBe('react-router-dom');
		expect(react[0]!.name).toBe('react');
	});

	it('main.tsx pin-overdraw: may exceed Depth; still one node per package', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-overdraw',
		})!;
		assertNoSameCategoryEdges(payload);

		const rrd = packageNodes(payload, 'react-router-dom');
		const react = packageNodes(payload, 'react');
		expect(rrd).toHaveLength(1);
		expect(react).toHaveLength(1);
		expect(rrd[0]!.name).toBe('react-router-dom');
		expect(react[0]!.name).toBe('react');
		// useUser at hop 3 → react natural pin 4 (overdraw past Depth)
		expect(react[0]!.category).toMatch(/^Export hop \d+$/);
		const hop = Number(react[0]!.category.replace('Export hop ', ''));
		expect(hop).toBeGreaterThanOrEqual(3);
	});

	it('main.tsx per-hop: legacy multi-column package copies', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'per-hop',
		})!;
		assertNoSameCategoryEdges(payload);

		const rrd = packageNodes(payload, 'react-router-dom');
		// focus Exports + structural hops
		expect(rrd.length).toBeGreaterThan(1);
		const cats = new Set(rrd.map((n) => n.category));
		expect(cats.has('Exports')).toBe(true);
	});

	it('main.tsx pin-clip depth=1: packages stay on Exports (no · package suffix)', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 1,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-clip',
		})!;
		const exportNames = payload.options.alluvial.nodes
			.filter((n) => n.category === 'Exports')
			.map((n) => n.name);
		expect(exportNames.some((n) => n.includes(' · package'))).toBe(false);
		expect(exportNames.filter((n) => n === 'react-router-dom')).toHaveLength(1);
		// No overdraw columns
		expect(
			payload.options.alluvial.nodes.some((n) =>
				n.category.startsWith('Export hop'),
			),
		).toBe(false);
	});

	it('main.tsx pin-overdraw depth=1: may add hop past Depth for pin', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 1,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'pin-overdraw',
		})!;
		const rrd = packageNodes(payload, 'react-router-dom');
		expect(rrd).toHaveLength(1);
		// App also imports rrd → pin at hop 2 even when Depth=1
		expect(rrd[0]!.category).toBe('Export hop 2');
		expect(rrd[0]!.name).toBe('react-router-dom');
	});

	it('pin-far modes: no · in/out hN on file or package labels', () => {
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

	it('per-hop still suffixes multi-hop package leaves', () => {
		const payload = projectFileHub(simpleGraph, 'src/main.tsx', {
			maxDepth: 3,
			maxDeps: 48,
			weightAxis: 'importer-loc',
			packageLeafMode: 'per-hop',
		})!;
		const hopPkgs = payload.options.alluvial.nodes.filter(
			(n) =>
				n.category.startsWith('Export hop') &&
				payload.meta.nodeRef[n.name]?.kind === 'package',
		);
		expect(hopPkgs.some((n) => / · out h\d+/.test(n.name))).toBe(true);
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

	it('userService: one category per sankey layer (no dual Imports)', () => {
		const id = 'src/services/userService.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const layers = longestPathLayers(payload);
		for (const [d, cats] of layers) {
			// Allow File + nothing else mixed; rings pure
			if (cats.has('File')) {
				expect([...cats], `layer ${d}`).toEqual(['File']);
				continue;
			}
			expect(cats.size, `layer ${d}: ${[...cats].join(',')}`).toBe(1);
		}
		// Headers should include Import hop 2 once
		const importerLayers = [...layers.values()].filter((c) =>
			[...c].some((x) => x === 'Imports' || x.startsWith('Import hop')),
		);
		const importerCats = importerLayers.map((c) => [...c][0]!);
		expect(importerCats.filter((c) => c === 'Imports').length).toBeLessThanOrEqual(
			1,
		);
		expect(importerCats.some((c) => c === 'Import hop 2')).toBe(true);
	});

	it('legacyHelpers: importer hop 3 / hop 2 / Imports each own a layer', () => {
		const id = 'src/utils/legacyHelpers.ts';
		const payload = projectFileHub(graph, id, {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const layers = longestPathLayers(payload);
		for (const [d, cats] of layers) {
			if (cats.has('File')) {
				expect([...cats], `layer ${d}`).toEqual(['File']);
				continue;
			}
			expect(cats.size, `layer ${d}: ${[...cats].join(',')}`).toBe(1);
		}
		const allCats = new Set(
			[...layers.values()].flatMap((s) => [...s]),
		);
		expect(allCats.has('Import hop 3')).toBe(true);
		expect(allCats.has('Import hop 2')).toBe(true);
		expect(allCats.has('Imports')).toBe(true);
		// File node appears once as focus
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

	it('export hop≥2 overflow bucket receives positive mass under small maxDeps', () => {
		const { graph } = indexFiles(wideExportHopFiles());
		const payload = projectFileHub(graph, 'focus.ts', {
			maxDepth: 2,
			maxDeps: 2,
			maxImporters: 8,
			weightAxis: 'import-edges',
		})!;
		const cats = categories(payload);
		expect(cats.has('Export hop 2')).toBe(true);

		const hop2Nodes = payload.options.alluvial.nodes.filter(
			(n) => n.category === 'Export hop 2',
		);
		const overflow = hop2Nodes.find((n) => n.name.includes('more'));
		expect(overflow, 'expected +N more on Export hop 2').toBeTruthy();

		const { out, inn } = flowTotals(payload.data);
		const incident =
			(out.get(overflow!.name) ?? 0) + (inn.get(overflow!.name) ?? 0);
		expect(incident, overflow!.name).toBeGreaterThan(0);

		// Dep mass still matches focus out-degree
		const focus = payload.meta.focus.label;
		const { depMass } = hubIncidentMass(payload, focus);
		expect(depMass).toBe(fileOutDegree(graph, 'focus.ts'));
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

		// depth=1: module refs on Imports (folder collapse)
		const shallowImportNodes = shallow.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports',
		);
		expect(shallowImportNodes.length).toBeGreaterThan(0);
		const shallowKinds = shallowImportNodes.map(
			(n) => shallow.meta.nodeRef[n.name]?.kind,
		);
		expect(shallowKinds.some((k) => k === 'module')).toBe(true);
		expect(shallowKinds.every((k) => k === 'module' || k === 'bucket')).toBe(
			true,
		);

		// depth=3: file leaves (no module collapse)
		const deepImportNodes = deep.options.alluvial.nodes.filter(
			(n) => n.category === 'Imports' || n.category.startsWith('Import hop'),
		);
		const deepKinds = deepImportNodes.map((n) => deep.meta.nodeRef[n.name]?.kind);
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
		expect(importerMass).toBe(hot!.inDegree);
		expect(depMass).toBe(hot!.outDegree);
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
