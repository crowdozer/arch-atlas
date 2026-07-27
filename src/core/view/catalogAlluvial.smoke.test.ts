/**
 * Smoke suite: complex fixture catalog entries → alluvial payloads
 * must conserve flow and match catalog edge metrics.
 *
 * UI open policy: every file catalog click mounts projectFileHub (start only).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, CodeGraph, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	fileInDegree,
	fileOutDegree,
} from '@core/view/fileImporters.ts';
import { isAlluvialRailName } from '@core/view/alluvial.ts';
import {
	preferFileHubView,
	projectFileHub,
} from '@core/view/fileHub.ts';
import { projectModuleFocus } from '@core/view/moduleFocus.ts';
import { projectPackageHub } from '@core/view/packageHub.ts';
import { primaryImporterFile } from '@core/view/packageImporters.ts';
import { EXTERNAL_IMPORT_CATEGORY } from '@core/view/hubCategories.ts';

/** Focus out-edges that are file→file (export-side hub mass). */
function fileOutFileDegree(graph: CodeGraph, fileId: string): number {
	let n = 0;
	for (const e of graph.edges) {
		if (e.from === fileId && e.toKind === 'file') n += 1;
	}
	return n;
}

/** Focus package/unresolved outs (import-side hub mass with reverse importers). */
function fileOutPackageDegree(graph: CodeGraph, fileId: string): number {
	let n = 0;
	for (const e of graph.edges) {
		if (
			e.from === fileId &&
			(e.toKind === 'package' || e.toKind === 'unresolved')
		) {
			n += 1;
		}
	}
	return n;
}

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

function totalValue(payload: AlluvialPayload): number {
	return payload.data.reduce((s, l) => s + l.value, 0);
}

/**
 * Conserved mass for a reverse / subject-on-left view: outflow from the focus
 * node (not sum of all hop links — multi-hop double-counts in totalValue).
 */
function focusOutflow(payload: AlluvialPayload): number {
	const focusName = payload.meta.focus.label;
	// Prefer focus label; fall back to startId basename-style match on File/Package
	const { out } = flowTotals(payload.data);
	if (out.has(focusName)) return out.get(focusName)!;
	const startId = payload.meta.startId;
	if (startId) {
		const base = startId.includes('/') ? startId.slice(startId.lastIndexOf('/') + 1) : startId;
		if (out.has(base)) return out.get(base)!;
		if (out.has(startId)) return out.get(startId)!;
	}
	// Subject category nodes (File / Package / Module)
	const subjectCats = new Set(['File', 'Package', 'Module', 'Code']);
	let sum = 0;
	for (const n of payload.options.alluvial.nodes) {
		if (subjectCats.has(n.category)) sum += out.get(n.name) ?? 0;
	}
	return sum;
}

/**
 * Intermediate columns: sum(in) === sum(out) for nodes that both receive and emit.
 * Dual-hub focus is exempt — left in-mass and right out-mass are independent.
 * Import-tree files that emit structural package mass (file → External package)
 * may have out > in; External packages themselves are sinks.
 * Rails and overflow buckets skip balance.
 */
function assertColumnConservation(payload: AlluvialPayload, label: string) {
	const { out, inn } = flowTotals(payload.data);
	const categories = new Map(
		payload.options.alluvial.nodes.map((n) => [n.name, n.category]),
	);
	const focusNames = new Set<string>([payload.meta.focus.label]);
	if (payload.meta.startId) {
		focusNames.add(payload.meta.startId);
		const base = payload.meta.startId.includes('/')
			? payload.meta.startId.slice(payload.meta.startId.lastIndexOf('/') + 1)
			: payload.meta.startId;
		focusNames.add(base);
	}
	// Dual-hub focus node (any disambiguated label) is the only File with both in+out
	for (const n of payload.options.alluvial.nodes) {
		if (n.category === 'File' && payload.meta.nodeRef[n.name]?.id === payload.meta.startId) {
			focusNames.add(n.name);
		}
	}
	const isPackageLike = (name: string): boolean => {
		const ref = payload.meta.nodeRef[name];
		if (!ref) return false;
		if (ref.kind === 'package' || ref.kind === 'unresolved') return true;
		if (
			ref.kind === 'bucket' &&
			(ref.id.includes('pkg') || ref.id.includes('external'))
		) {
			return true;
		}
		return categories.get(name) === 'External';
	};
	/**
	 * File/rail that fans structural mass into External packages (out may
	 * exceed in). Includes File → in-rail → package pads (Carbon External hop).
	 */
	const emitsPackageStructural = (name: string): boolean => {
		const seen = new Set<string>();
		const q = [name];
		seen.add(name);
		while (q.length) {
			const cur = q.shift()!;
			for (const l of payload.data) {
				if (l.source !== cur) continue;
				if (isPackageLike(l.target)) return true;
				// Follow pad rails only (do not walk real file→file mass)
				if (isAlluvialRailName(l.target) && !seen.has(l.target)) {
					seen.add(l.target);
					q.push(l.target);
				}
			}
		}
		return false;
	};

	for (const name of new Set([...out.keys(), ...inn.keys()])) {
		if (focusNames.has(name)) continue;
		// Overflow / aggregate buckets may under-draw under integer multi-parent
		// split (accepted hub default) — skip intermediate balance for them.
		if (name.startsWith('(') || name.startsWith('+')) continue;
		if (isPackageLike(name)) continue;
		if (isAlluvialRailName(name)) continue; // pad scaffolding
		if (emitsPackageStructural(name)) continue;
		const hasIn = (inn.get(name) ?? 0) > 0;
		const hasOut = (out.get(name) ?? 0) > 0;
		if (hasIn && hasOut) {
			expect(inn.get(name), `${label}: ${name} (${categories.get(name)}) in`).toBe(
				out.get(name),
			);
		}
	}
}

function assertNodeRefCoversNamedNodes(payload: AlluvialPayload, label: string) {
	for (const n of payload.options.alluvial.nodes) {
		if (n.name.startsWith('(')) {
			// buckets may or may not be in nodeRef
			continue;
		}
		const ref = payload.meta.nodeRef[n.name];
		expect(ref, `${label}: nodeRef missing for ${n.name}`).toBeTruthy();
		expect(ref.kind).not.toBeUndefined();
	}
}

/** Payload the UI mounts for any file catalog click (always file-hub). */
function payloadForFileClick(graph: CodeGraph, fileId: string): AlluvialPayload | null {
	// Edge-count conservation assertions use import-edges (UI default is target-loc).
	return projectFileHub(graph, fileId, { weightAxis: 'import-edges' });
}

/** Incident mass on hub focus (in + out); one-sided hubs use the present side. */
function focusIncidentMass(payload: AlluvialPayload): number {
	const focusName = payload.meta.focus.label;
	const { out, inn } = flowTotals(payload.data);
	const inMass = inn.get(focusName) ?? 0;
	const outMass = out.get(focusName) ?? 0;
	if (inMass > 0 || outMass > 0) return inMass + outMass;
	return focusOutflow(payload);
}

describe('catalog ↔ alluvial smoke (demo-next-complex)', () => {
	const { graph, catalog } = indexFiles(
		walk(path.join(fixturesRoot, 'demo-next-complex')),
	);

	it('indexes a dense graph with catalog sections', () => {
		expect(graph.stats.edgeCount).toBeGreaterThan(30);
		expect(catalog.hotspots.length).toBeGreaterThan(5);
		expect(catalog.complex.length).toBeGreaterThan(3);
		expect(catalog.deepest.length).toBeGreaterThan(3);
		expect(catalog.starts.length).toBeGreaterThan(0);
		expect(catalog.ends.length).toBeGreaterThan(0);
	});

	it('every tree-depth entry: hub open conserves', () => {
		for (const d of catalog.deepest) {
			expect(d.maxHops).toBeGreaterThanOrEqual(1);
			const payload = payloadForFileClick(graph, d.id);
			expect(payload, `depth ${d.path}`).not.toBeNull();
			assertColumnConservation(payload!, `depth ${d.path}`);
			assertNodeRefCoversNamedNodes(payload!, `depth ${d.path}`);
			expect(totalValue(payload!)).toBeGreaterThan(0);
			expect(focusIncidentMass(payload!)).toBe(
				fileInDegree(graph, d.id) + fileOutDegree(graph, d.id),
			);
			// Optional hop columns when both sides and depth allows (default radius 3)
			const cats = new Set(payload!.options.alluvial.nodes.map((n) => n.category));
			// Imports: outbound file deps and/or focus packages
			const hasImportSide =
				fileOutFileDegree(graph, d.id) > 0 ||
				fileOutPackageDegree(graph, d.id) > 0;
			// Exports: reverse importers only
			const hasExportSide = fileInDegree(graph, d.id) > 0;
			if (hasImportSide) expect(cats.has('Imports')).toBe(true);
			if (hasExportSide) expect(cats.has('Exports')).toBe(true);
		}
	});

	it('every tree-complexity entry: hub open conserves; downwindEdges ≥ 1', () => {
		for (const c of catalog.complex) {
			expect(c.downwindEdges).toBeGreaterThanOrEqual(1);
			expect(c.downwindEdges).toBeGreaterThanOrEqual(c.packageEnds);
			const payload = payloadForFileClick(graph, c.id);
			expect(payload, `complex ${c.path}`).not.toBeNull();
			assertColumnConservation(payload!, `complex ${c.path}`);
			assertNodeRefCoversNamedNodes(payload!, `complex ${c.path}`);
			expect(totalValue(payload!)).toBeGreaterThan(0);
			expect(focusIncidentMass(payload!)).toBe(
				fileInDegree(graph, c.id) + fileOutDegree(graph, c.id),
			);
		}
	});

	it('every high-edge hotspot: hub mass matches in+out edge-record degrees', () => {
		for (const h of catalog.hotspots) {
			// edgeCount is pre-demotion unique/package runtime score; sort by rankScore
			expect(h.edgeCount).toBeGreaterThan(0);
			expect(h.rankScore ?? h.edgeCount).toBeGreaterThan(0);
			expect(fileOutDegree(graph, h.id)).toBe(h.outDegree);
			expect(fileInDegree(graph, h.id)).toBe(h.inDegree);

			const payload = payloadForFileClick(graph, h.id);
			expect(payload, `payload for hotspot ${h.path}`).not.toBeNull();
			assertColumnConservation(payload!, `hotspot ${h.path}`);
			assertNodeRefCoversNamedNodes(payload!, `hotspot ${h.path}`);

			// Hub: incident mass === edge-record in + out (not unique-neighbor score)
			expect(focusIncidentMass(payload!), `${h.path} hub mass`).toBe(
				h.outDegree + h.inDegree,
			);
			expect(payload!.meta.focus.kind).toBe('file');
			const cats = new Set(
				payload!.options.alluvial.nodes.map((n) => n.category),
			);
			// Imports = outbound deps/packages; Exports = reverse importers
			if (fileOutFileDegree(graph, h.id) > 0 || fileOutPackageDegree(graph, h.id) > 0) {
				expect(cats.has('Imports')).toBe(true);
			}
			if (h.inDegree > 0) {
				expect(cats.has('Exports')).toBe(true);
			}
			expect(cats.has('Import folders')).toBe(false);
		}
	});

	it('redis.ts (both sides) opens dual hub with in+out total', () => {
		const id = 'src/lib/redis.ts';
		expect(preferFileHubView(graph, id)).toBe(true);
		const inn = fileInDegree(graph, id);
		const out = fileOutDegree(graph, id);
		expect(inn).toBeGreaterThan(0);
		expect(out).toBeGreaterThan(0);
		const payload = projectFileHub(graph, id, { weightAxis: 'import-edges' })!;
		expect(focusIncidentMass(payload)).toBe(inn + out);
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		expect(cats.has('Imports')).toBe(true);
		expect(cats.has('Exports')).toBe(true);
	});

	it('logger.ts pure sink opens hub Exports-only with full importer count', () => {
		const id = 'src/lib/logger.ts';
		// preferFileHubView is false (no out) but UI still opens hub
		expect(preferFileHubView(graph, id)).toBe(false);
		const inn = fileInDegree(graph, id);
		expect(inn).toBeGreaterThan(0);
		const payload = payloadForFileClick(graph, id)!;
		expect(focusIncidentMass(payload)).toBe(inn);
		const cats = new Set(payload.options.alluvial.nodes.map((n) => n.category));
		// Hard law: reverse importers live on Exports
		expect(cats.has('Exports')).toBe(true);
		expect(cats.has('Imports')).toBe(false);
		expect(cats.has('Import folders')).toBe(false);
	});

	it('every catalog end with imports: package-hub conserves and has External sink', () => {
		for (const end of catalog.ends) {
			if (end.inDegree === 0) {
				expect(primaryImporterFile(graph, end.id)).toBeNull();
				expect(projectPackageHub(graph, end.id)).toBeNull();
				continue;
			}
			const payload = projectPackageHub(graph, end.id, {
				weightAxis: 'import-edges',
			});
			expect(payload, `package-hub for ${end.label}`).not.toBeNull();
			assertColumnConservation(payload!, `end ${end.label}`);
			assertNodeRefCoversNamedNodes(payload!, `end ${end.label}`);
			expect(totalValue(payload!)).toBeGreaterThan(0);
			const cats = new Set(
				payload!.options.alluvial.nodes.map((n) => n.category),
			);
			expect(cats.has(EXTERNAL_IMPORT_CATEGORY)).toBe(true);
			expect(cats.has('File')).toBe(false);
			expect(cats.has('Imports')).toBe(false);
			// Inflow into External equals observed importer edge count
			const { inn } = flowTotals(payload!.data);
			const externalNames = payload!.options.alluvial.nodes
				.filter((n) => n.category === EXTERNAL_IMPORT_CATEGORY)
				.map((n) => n.name);
			expect(externalNames.length).toBe(1);
			expect(inn.get(externalNames[0]!) ?? 0).toBe(end.inDegree);
			// Pairs present for focus reverse∪
			expect(
				(payload!.meta.externalStraightPairs ?? []).length,
			).toBeGreaterThan(0);
		}
	});

	it('every catalog start: hub conserves and has nodeRef', () => {
		for (const s of catalog.starts.slice(0, 25)) {
			const payload = payloadForFileClick(graph, s.id);
			if (!payload) {
				// Allowed only if no out and no in
				expect(s.outDegree + s.inDegree).toBe(0);
				continue;
			}
			assertColumnConservation(payload, `start ${s.path}`);
			assertNodeRefCoversNamedNodes(payload, `start ${s.path}`);
			expect(focusIncidentMass(payload)).toBe(s.outDegree + s.inDegree);
		}
	});

	it('module focus for topFolders of hotspot files conserves', () => {
		const folders = new Set(
			catalog.hotspots.map((h) => {
				const parts = h.path.split('/');
				if (parts.length <= 1) return '(root)';
				if (parts[0] === 'src' && parts.length > 2) return `src/${parts[1]}`;
				return parts[0]!;
			}),
		);
		let checked = 0;
		for (const folder of folders) {
			const payload = projectModuleFocus(graph, folder);
			if (!payload) continue;
			checked += 1;
			assertColumnConservation(payload, `module ${folder}`);
			assertNodeRefCoversNamedNodes(payload, `module ${folder}`);
			// Module left → ends right: module out === total
			const { out } = flowTotals(payload.data);
			expect(out.get(folder) ?? 0).toBe(totalValue(payload));
		}
		expect(checked).toBeGreaterThan(0);
	});
});
