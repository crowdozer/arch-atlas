/**
 * Smoke suite: complex fixture catalog entries → alluvial payloads
 * must conserve flow and match catalog edge metrics.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, CodeGraph, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectAlluvial } from '@core/view/alluvial.ts';
import {
	fileInDegree,
	fileOutDegree,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
import { projectModuleFocus } from '@core/view/moduleFocus.ts';
import { projectMultiHopAlluvial } from '@core/view/multiHop.ts';
import { projectPackageImporters } from '@core/view/packageImporters.ts';

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

/** Intermediate columns: sum(in) === sum(out) for every non-source non-sink? */
function assertColumnConservation(payload: AlluvialPayload, label: string) {
	const { out, inn } = flowTotals(payload.data);
	const categories = new Map(
		payload.options.alluvial.nodes.map((n) => [n.name, n.category]),
	);
	// Nodes that both receive and emit should balance
	for (const name of new Set([...out.keys(), ...inn.keys()])) {
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

/** Payload the UI would mount for a file catalog click. */
function payloadForFileClick(graph: CodeGraph, fileId: string): AlluvialPayload | null {
	if (preferFileImportersView(graph, fileId)) {
		return projectFileImporters(graph, fileId);
	}
	return projectAlluvial(graph, fileId);
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
		expect(catalog.views.length).toBeGreaterThan(0);
	});

	it('every tree-depth entry: multi-hop open conserves', () => {
		for (const d of catalog.deepest) {
			expect(d.maxHops).toBeGreaterThanOrEqual(1);
			const payload = projectMultiHopAlluvial(graph, d.id);
			expect(payload, `depth ${d.path}`).not.toBeNull();
			assertColumnConservation(payload!, `depth ${d.path}`);
			assertNodeRefCoversNamedNodes(payload!, `depth ${d.path}`);
			expect(totalValue(payload!)).toBeGreaterThan(0);

			if (d.maxHops >= 2) {
				const hopNodes = payload!.options.alluvial.nodes.filter((n) =>
					n.category.startsWith('Hop'),
				);
				expect(hopNodes.length, `${d.path} should have hop columns`).toBeGreaterThan(
					0,
				);
			}
		}
	});

	it('every tree-complexity entry: multi-hop open conserves; packageEnds ≥ 1', () => {
		for (const c of catalog.complex) {
			expect(c.packageEnds).toBeGreaterThanOrEqual(1);
			const payload = projectMultiHopAlluvial(graph, c.id);
			expect(payload, `complex ${c.path}`).not.toBeNull();
			assertColumnConservation(payload!, `complex ${c.path}`);
			assertNodeRefCoversNamedNodes(payload!, `complex ${c.path}`);
			expect(totalValue(payload!)).toBeGreaterThan(0);
		}
	});

	it('every high-edge hotspot: view total matches dominant edge side', () => {
		for (const h of catalog.hotspots) {
			expect(h.edgeCount).toBe(h.outDegree + h.inDegree);
			expect(fileOutDegree(graph, h.id)).toBe(h.outDegree);
			expect(fileInDegree(graph, h.id)).toBe(h.inDegree);

			const payload = payloadForFileClick(graph, h.id);
			expect(payload, `payload for hotspot ${h.path}`).not.toBeNull();
			assertColumnConservation(payload!, `hotspot ${h.path}`);
			assertNodeRefCoversNamedNodes(payload!, `hotspot ${h.path}`);

			const total = totalValue(payload!);
			if (preferFileImportersView(graph, h.id)) {
				// Reverse: unit count === inbound file edges
				expect(total, `${h.path} reverse total`).toBe(h.inDegree);
				expect(payload!.meta.focus.kind).toBe('file');
			} else {
				// Forward: package-edge units in reachable set (may be < outDegree
				// because file→file edges are not package units)
				const packageOut = graph.edges.filter(
					(e) =>
						e.from === h.id &&
						(e.toKind === 'package' || e.toKind === 'unresolved'),
				).length;
				// At least the start's direct package edges appear in the flow
				// (reachable package edges can be more via intermediate files)
				if (packageOut === 0 && h.outDegree > 0) {
					// only file imports out — may be empty package map or placeholder
					expect(total).toBeGreaterThan(0);
				} else if (packageOut > 0) {
					expect(total).toBeGreaterThanOrEqual(packageOut);
				}
			}
		}
	});

	it('redis.ts (fan-in dominant) opens reverse with inDegree total', () => {
		const id = 'src/lib/redis.ts';
		expect(preferFileImportersView(graph, id)).toBe(true);
		const inn = fileInDegree(graph, id);
		const out = fileOutDegree(graph, id);
		expect(inn).toBeGreaterThan(out);
		const payload = projectFileImporters(graph, id)!;
		expect(totalValue(payload)).toBe(inn);
		// Forward under-represents catalog edge count
		const forward = projectAlluvial(graph, id)!;
		expect(totalValue(forward)).toBeLessThan(inn);
	});

	it('logger.ts pure sink opens reverse with full importer count', () => {
		const id = 'src/lib/logger.ts';
		expect(preferFileImportersView(graph, id)).toBe(true);
		const payload = projectFileImporters(graph, id)!;
		expect(totalValue(payload)).toBe(fileInDegree(graph, id));
	});

	it('every catalog end: package reverse total === inDegree', () => {
		for (const end of catalog.ends) {
			if (end.inDegree === 0) {
				// Declared package with no imports — no reverse payload
				const p = projectPackageImporters(graph, end.id);
				expect(p).toBeNull();
				continue;
			}
			const payload = projectPackageImporters(graph, end.id);
			expect(payload, `package ${end.label}`).not.toBeNull();
			assertColumnConservation(payload!, `end ${end.label}`);
			assertNodeRefCoversNamedNodes(payload!, `end ${end.label}`);
			expect(totalValue(payload!), end.label).toBe(end.inDegree);
			// Subject on the left
			expect(payload!.data.every((l) => l.source === end.label || l.source === '(other ends)') ||
				payload!.data.some((l) => l.source === end.label)).toBe(true);
		}
	});

	it('every catalog start: chosen view conserves and has nodeRef', () => {
		for (const s of catalog.starts.slice(0, 25)) {
			const payload = payloadForFileClick(graph, s.id);
			if (!payload) {
				// Allowed only if no out and no in
				expect(s.outDegree + s.inDegree).toBe(0);
				continue;
			}
			assertColumnConservation(payload, `start ${s.path}`);
			assertNodeRefCoversNamedNodes(payload, `start ${s.path}`);
			expect(totalValue(payload)).toBeGreaterThan(0);
			if (preferFileImportersView(graph, s.id)) {
				expect(totalValue(payload)).toBe(s.inDegree);
			}
		}
	});

	it('every suggested view startId resolves to a non-empty alluvial', () => {
		for (const v of catalog.views) {
			const payload = payloadForFileClick(graph, v.startId);
			expect(payload, `view ${v.id}`).not.toBeNull();
			assertColumnConservation(payload!, `view ${v.id}`);
			assertNodeRefCoversNamedNodes(payload!, `view ${v.id}`);
			expect(totalValue(payload!)).toBeGreaterThan(0);
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
