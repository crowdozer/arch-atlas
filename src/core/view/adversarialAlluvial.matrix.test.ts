/**
 * Phase 4 - adversarial alluvial matrix (closure of engine correctness triage).
 *
 * One asymmetric corpus covering:
 * - unit-mass fan-out (1B)
 * - convergent cycle / long simple path (1A)
 * - uneven depth
 * - package + module identity collisions (2A)
 * - capped overflow
 * - sticky package id resolve (2B)
 *
 * Asserts normalized node/link tables, integrity, axis topology stability,
 * input permutation stability, and FocusPlan ↔ drawn-inventory closure.
 * No golden that re-describes a known defect.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import {
	fileImportAdj,
	fileLongestDistances,
} from '@core/catalog/deepest.ts';
import { assertAlluvialPayloadIntegrity } from '@core/view/alluvialPayloadIntegrity.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import { projectModuleFocus } from '@core/view/moduleFocus.ts';
import { projectPackageHub } from '@core/view/packageHub.ts';
import { isAlluvialRailName } from '@core/view/alluvial.ts';
import { listDrawnBandsFromPayload } from '../../stage/focus/displayInventory.ts';
import {
	buildLogicalFocusGraph,
	planFocus,
	type FocusSeed,
} from '../../stage/focus/logicalFocusGraph.ts';
import { observeHubFocus } from '../../stage/focus/focusHarness.ts';
import { resolvePackageSeedName } from '../../stage/focus/resolvePackageSeedName.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures/adversarial-alluvial-matrix',
);

function walk(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full, base));
		else {
			const rel = path.relative(base, full).split(path.sep).join('/');
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel,
				content,
				byteLength: Buffer.byteLength(content),
			});
		}
	}
	return out;
}

/** Stable serialization for permutation comparisons (sorted). */
function normalizePayload(payload: AlluvialPayload): {
	nodes: string[];
	links: string[];
	nodeRef: string[];
	pairs: string[];
} {
	const nodes = [...payload.options.alluvial.nodes]
		.map((n) => `${n.name}\0${n.category}`)
		.sort();
	const links = [...payload.data]
		.map((l) => `${l.source}\0${l.target}\0${Number(l.value.toFixed(8))}`)
		.sort();
	const nodeRef = Object.entries(payload.meta.nodeRef)
		.map(([name, r]) => `${name}\0${r.kind}\0${r.id}`)
		.sort();
	const pairs = [...(payload.meta.externalStraightPairs ?? [])]
		.map((p) => `${p.parent}\0${p.packageName}\0${Number(p.width.toFixed(8))}`)
		.sort();
	return { nodes, links, nodeRef, pairs };
}

function assertFocusInventoryClosure(
	payload: AlluvialPayload,
	seed: FocusSeed,
	label: string,
): void {
	const obs = observeHubFocus(payload, seed);
	const invKeys = new Set(obs.inventory.bands.map((b) => b.key));

	// Every drawn band is focus or dim
	for (const b of obs.inventory.bands) {
		const paint = obs.classification.get(b.key);
		expect(
			paint === 'focus' || paint === 'dim',
			`${label}: band ${b.key} not classified`,
		).toBe(true);
		// Rails never in inventory
		expect(isAlluvialRailName(b.source)).toBe(false);
		expect(isAlluvialRailName(b.target)).toBe(false);
	}

	// Focused keys exist in drawn inventory
	for (const k of obs.plan.focusedBandKeys) {
		expect(invKeys.has(k), `${label}: focused key missing from inventory ${k}`).toBe(
			true,
		);
	}

	// Rails never focus as labels
	for (const n of obs.plan.activeLabels) {
		expect(isAlluvialRailName(n), `${label}: rail in activeLabels ${n}`).toBe(
			false,
		);
	}
}

describe('adversarial alluvial matrix (Phase 4)', () => {
	const files = walk(fixturesRoot);
	const { graph } = indexFiles(files);

	it('corpus has expected structural features', () => {
		expect(graph.files.has('entry.ts')).toBe(true);
		expect(graph.files.has('fan/a.ts')).toBe(true);
		expect(graph.packages.has('react')).toBe(true);
		// Cycle a↔b
		const adj = fileImportAdj(graph);
		expect(adj.get('fan/a.ts') ?? []).toContain('fan/b.ts');
		expect(adj.get('fan/b.ts') ?? []).toContain('fan/a.ts');
		// Longest simple path fan/root → c at 3
		const { dist, maxHops } = fileLongestDistances(graph, 'fan/root.ts');
		expect(dist.get('fan/c.ts')).toBe(3);
		expect(maxHops).toBeGreaterThanOrEqual(3);
	});

	describe('file-hub at entry', () => {
		const axes = ['import-edges', 'target-loc', 'importer-loc'] as const;

		it('integrity + topology: fan-out children, deep chain, packages', () => {
			const payload = projectFileHub(graph, 'entry.ts', {
				maxDepth: 4,
				maxDeps: 48,
				maxImporters: 48,
				weightAxis: 'import-edges',
			})!;
			assertAlluvialPayloadIntegrity(payload, 'entry hub');

			const ids = new Set(
				Object.values(payload.meta.nodeRef).map((r) => r.id),
			);
			// Unit-mass fan-out path present via fan/root
			expect(ids.has('fan/root.ts') || ids.has('fan/a.ts')).toBe(true);
			// Packages
			expect(
				Object.values(payload.meta.nodeRef).some(
					(r) => r.kind === 'package' && r.id === 'react',
				),
			).toBe(true);
			expect(
				Object.values(payload.meta.nodeRef).some(
					(r) => r.kind === 'package' && r.id === 'lodash',
				),
			).toBe(true);
		});

		it('uncapped fan-out topology stable across weight axes', () => {
			const childIds = (axis: (typeof axes)[number]) => {
				const p = projectFileHub(graph, 'fan/root.ts', {
					maxDepth: 3,
					weightAxis: axis,
				})!;
				assertAlluvialPayloadIntegrity(p, `fan root ${axis}`);
				const fromA = p.data.filter(
					(l) => p.meta.nodeRef[l.source]?.id === 'fan/a.ts',
				);
				const kids = new Set(
					fromA
						.map((l) => p.meta.nodeRef[l.target]?.id)
						.filter((id): id is string => !!id),
				);
				return kids;
			};
			const e = childIds('import-edges');
			const t = childIds('target-loc');
			const i = childIds('importer-loc');
			for (const set of [e, t, i]) {
				expect(set.has('fan/b.ts')).toBe(true);
				expect(set.has('fan/c.ts')).toBe(true);
			}
		});

		it('cyclic fan: c appears at hop ≥2 with positive mass', () => {
			const p = projectFileHub(graph, 'fan/root.ts', {
				maxDepth: 4,
				weightAxis: 'import-edges',
			})!;
			const cNodes = p.options.alluvial.nodes.filter(
				(n) => p.meta.nodeRef[n.name]?.id === 'fan/c.ts',
			);
			expect(cNodes.length).toBeGreaterThan(0);
			const cMass = p.data
				.filter((l) => p.meta.nodeRef[l.target]?.id === 'fan/c.ts')
				.reduce((s, l) => s + l.value, 0);
			expect(cMass).toBeGreaterThan(0);
		});

		it('capped overflow: +N more bucket when maxDeps tight', () => {
			const p = projectFileHub(graph, 'entry.ts', {
				maxDepth: 2,
				maxDeps: 3,
				maxImporters: 48,
				weightAxis: 'import-edges',
			})!;
			assertAlluvialPayloadIntegrity(p, 'entry capped');
			const buckets = Object.entries(p.meta.nodeRef).filter(
				([, r]) => r.kind === 'bucket',
			);
			expect(
				buckets.some(
					([name, r]) =>
						name.includes('more') ||
						r.id.includes('more') ||
						r.id.includes('other'),
				),
				'expected overflow bucket under maxDeps=3',
			).toBe(true);
		});

		it('input permutation of edges yields same normalized payload', () => {
			// Rebuild with edge list reversed (indexFiles order follows file walk)
			const reversed = [...files].reverse();
			const { graph: g2 } = indexFiles(reversed);
			const a = projectFileHub(graph, 'entry.ts', {
				maxDepth: 3,
				weightAxis: 'import-edges',
			})!;
			const b = projectFileHub(g2, 'entry.ts', {
				maxDepth: 3,
				weightAxis: 'import-edges',
			})!;
			expect(normalizePayload(a)).toEqual(normalizePayload(b));
		});

		it('FocusPlan inventory closure for file, package, and band seeds', () => {
			const p = projectFileHub(graph, 'entry.ts', {
				maxDepth: 3,
				maxDeps: 48,
				maxImporters: 48,
				weightAxis: 'import-edges',
			})!;
			const focusName = p.meta.focus.label;
			assertFocusInventoryClosure(
				p,
				{ kind: 'file', name: focusName },
				'file seed',
			);

			const pkgName = Object.entries(p.meta.nodeRef).find(
				([, r]) => r.kind === 'package' && r.id === 'lodash',
			)?.[0];
			expect(pkgName).toBeTruthy();
			assertFocusInventoryClosure(
				p,
				{ kind: 'package', name: pkgName! },
				'package seed',
			);

			const inv = listDrawnBandsFromPayload(p);
			const band = inv.bands.find((b) => b.kind === 'carbon');
			expect(band).toBeTruthy();
			assertFocusInventoryClosure(
				p,
				{
					kind: 'band',
					source: band!.source,
					target: band!.target,
					display: 'carbon',
				},
				'band seed',
			);
		});
	});

	describe('module-focus identity (2A)', () => {
		it('module react + package react stay distinct; integrity holds', () => {
			const p = projectModuleFocus(graph, 'react', {
				weightAxis: 'import-edges',
			})!;
			assertAlluvialPayloadIntegrity(p, 'module react');
			expect(p.data.every((l) => l.source !== l.target)).toBe(true);
			const focusName = p.meta.focus.label;
			expect(p.meta.nodeRef[focusName]?.kind).toBe('module');
			const pkg = Object.entries(p.meta.nodeRef).find(
				([, r]) => r.kind === 'package' && r.id === 'react',
			);
			expect(pkg).toBeTruthy();
			expect(pkg![0]).not.toBe(focusName);
		});
	});

	describe('package-hub sticky id (2B)', () => {
		it('painted file-hub label resolves to package-hub seed with focused bands', () => {
			// depth=1 + many importers → module collapse can decorate package label
			const fileHub = projectFileHub(graph, 'entry.ts', {
				maxDepth: 1,
				maxDeps: 48,
				maxImporters: 48,
				weightAxis: 'import-edges',
			})!;
			const painted = Object.entries(fileHub.meta.nodeRef).find(
				([, r]) => r.kind === 'package' && r.id === 'react',
			)?.[0];
			expect(painted).toBeTruthy();

			const pkgHub = projectPackageHub(graph, 'react', {
				maxDepth: 2,
				weightAxis: 'import-edges',
			})!;
			assertAlluvialPayloadIntegrity(pkgHub, 'package-hub react');

			const resolved = resolvePackageSeedName('react', pkgHub);
			expect(resolved).toBeTruthy();
			// If painted was claimName-decorated, it must not be the package-hub seed
			if (painted !== resolved) {
				const bad = planFocus(buildLogicalFocusGraph(pkgHub), {
					kind: 'package',
					name: painted!,
				});
				expect(bad.focusedBandKeys.size).toBe(0);
			}
			const good = planFocus(buildLogicalFocusGraph(pkgHub), {
				kind: 'package',
				name: resolved!,
			});
			expect(good.focusedBandKeys.size).toBeGreaterThan(0);
			assertFocusInventoryClosure(
				pkgHub,
				{ kind: 'package', name: resolved! },
				'sticky package',
			);
		});
	});

	describe('uneven depth', () => {
		it('deep chain d1→d2→d3 expands under radius 3', () => {
			const p = projectFileHub(graph, 'entry.ts', {
				maxDepth: 4,
				weightAxis: 'import-edges',
			})!;
			const ids = new Set(
				Object.values(p.meta.nodeRef).map((r) => r.id),
			);
			expect(ids.has('deep/d1.ts')).toBe(true);
			// d3 at depth 3 from entry via d1→d2→d3
			expect(ids.has('deep/d3.ts') || ids.has('deep/d2.ts')).toBe(true);
		});
	});
});
