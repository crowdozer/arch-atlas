/**
 * Pure buildAgentMermaid unit tests (no FS host).
 */
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import { buildMapCatalog } from '@core/catalog/views.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { buildAgentMermaid } from '@core/export/agentMermaid.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

const source = { kind: 'directory' as const, path: '/tmp/fixture' };

describe('buildAgentMermaid', () => {
	it('cross-prefix cycle → prefix SCC subgraph or <--> + both nodes', () => {
		// client/a.ts ↔ lib/b.ts (different topFolder: client vs lib)
		const graph = buildGraph(
			files([
				['client/a.ts', `import { b } from '../lib/b';\nexport const a = 1;\n`],
				['lib/b.ts', `import { a } from '../client/a';\nexport const b = 1;\n`],
			]),
		);
		const text = buildAgentMermaid({ graph, source, limit: 40 });

		expect(text).toMatch(/^flowchart LR/m);
		expect(text).toMatch(/grain=topFolder/);
		expect(text).toMatch(/L1 estimate topology/);
		expect(text).toMatch(/not LSP/);
		expect(text).toMatch(/not domain map/);
		expect(text).toMatch(/not Exact mass/);
		// Both prefixes present
		expect(text).toContain('["client"]');
		expect(text).toContain('["lib"]');
		// Multi-prefix SCC visual
		expect(text).toMatch(/subgraph scc\d+\["SCC · size 2"\]/);
		// Size-2 mutual prefix pair → bidirectional edge with count label
		expect(text).toMatch(/<-->\|"\d+"\|/);
		// File SCC comment lists both files
		expect(text).toMatch(/cycles\.runtime \(file SCC\):/);
		expect(text).toMatch(/client\/a\.ts/);
		expect(text).toMatch(/lib\/b\.ts/);
		// Prefix SCC comment
		expect(text).toMatch(/cycles\.runtime \(prefix SCC\):/);
		expect(text).toMatch(/size=2 sample=client, lib|size=2 sample=lib, client/);
	});

	it('same-prefix cycle → comment lists file SCC; no multi-prefix SCC noise', () => {
		// client/sim/physics ↔ client/sim/weapons - both topFolder client/sim
		const graph = buildGraph(
			files([
				[
					'client/sim/physics.ts',
					`import { w } from './weapons';\nexport const p = 1;\n`,
				],
				[
					'client/sim/weapons.ts',
					`import { p } from './physics';\nexport const w = 1;\n`,
				],
				// Cross-prefix edge so diagram has a node
				[
					'client/main.ts',
					`import { p } from './sim/physics';\nexport const m = p;\n`,
				],
			]),
		);
		const catalog = buildMapCatalog(graph, { limit: 40 });
		const text = buildAgentMermaid({ graph, catalog, source, limit: 40 });

		expect(text).toMatch(/cycles\.runtime \(file SCC\):/);
		expect(text).toMatch(/client\/sim\/physics\.ts/);
		expect(text).toMatch(/client\/sim\/weapons\.ts/);
		// Within-prefix cycle collapses - no multi-prefix SCC for sim alone
		expect(text).toMatch(/\(none multi-prefix\)|prefix SCC\): \(none/);
		// Honesty note present
		expect(text).toMatch(/within-prefix file cycles/);
		// client and client/sim are distinct prefixes on the main→physics edge
		expect(text).toContain('["client"]');
		expect(text).toContain('["client/sim"]');
	});

	it('acyclic A→B→C → directed edges, empty file SCC section', () => {
		const graph = buildGraph(
			files([
				['pkg/a/a.ts', `import { b } from '../../pkg/b/b';\nexport const a = 1;\n`],
				['pkg/b/b.ts', `import { c } from '../../pkg/c/c';\nexport const b = 1;\n`],
				['pkg/c/c.ts', `export const c = 1;\n`],
			]),
		);
		// topFolder: pkg/a, pkg/b, pkg/c (depth ≥ 3)
		const text = buildAgentMermaid({ graph, source, limit: 40 });

		expect(text).toMatch(/cycles\.runtime \(file SCC\): \(none\)/);
		expect(text).toMatch(/\(none multi-prefix\)/);
		expect(text).toContain('["pkg/a"]');
		expect(text).toContain('["pkg/b"]');
		expect(text).toContain('["pkg/c"]');
		expect(text).toMatch(/-->\|"1"\|/);
		expect(text).not.toMatch(/<-->/);
		expect(text).not.toMatch(/subgraph scc/);
	});

	it('escapes quotes in labels; opaque node ids', () => {
		const graph = buildGraph(
			files([
				// Unusual path segment with quote-like content is hard via imports;
				// verify escapeLabel path via a normal prefix and id opacity.
				['src/lib/foo.ts', `import { x } from '../../app/bar';\nexport const f = 1;\n`],
				['app/bar.ts', `export const x = 1;\n`],
			]),
		);
		const text = buildAgentMermaid({ graph, source, limit: 40 });

		// Opaque ids n0, n1… not raw path segments as ids
		expect(text).toMatch(/\bn\d+\["/);
		expect(text).not.toMatch(/^  src\/lib /m);
		expect(text).toContain('["src/lib"]');
		expect(text).toContain('["app"]');
	});

	it('respects limit cap; prefers SCC-related prefixes when possible', () => {
		// Build many prefixes: hub/h imports leaf0..leafN under modules/mN
		const entries: Array<[string, string]> = [];
		const n = 12;
		for (let i = 0; i < n; i++) {
			entries.push([
				`modules/m${i}/leaf.ts`,
				`export const v${i} = ${i};\n`,
			]);
		}
		// hub imports all leaves
		const imports = Array.from(
			{ length: n },
			(_, i) => `import { v${i} } from '../modules/m${i}/leaf';`,
		).join('\n');
		entries.push(['hub/core.ts', `${imports}\nexport const hub = 1;\n`]);
		// Add a cross-prefix cycle between cycle/a and cycle/b so they force-include
		entries.push([
			'cycle/a/x.ts',
			`import { y } from '../../cycle/b/y';\nexport const x = 1;\n`,
		]);
		entries.push([
			'cycle/b/y.ts',
			`import { x } from '../../cycle/a/x';\nexport const y = 1;\n`,
		]);

		const graph = buildGraph(files(entries));
		const text = buildAgentMermaid({ graph, source, limit: 6 });

		expect(text).toMatch(/%% truncated:/);
		expect(text).toMatch(/limit=6/);
		// Cycle prefixes retained
		expect(text).toContain('["cycle/a"]');
		expect(text).toContain('["cycle/b"]');
		// Node count capped: count opaque id declarations
		const nodeDecls = text.match(/\bn\d+\["/g) ?? [];
		expect(nodeDecls.length).toBeLessThanOrEqual(6);
		expect(nodeDecls.length).toBeGreaterThan(0);
	});

	it('omits external package ends by default', () => {
		const graph = buildGraph(
			files([
				[
					'src/a.ts',
					`import { z } from 'zod';\nimport { b } from '../lib/b';\nexport const a = 1;\n`,
				],
				['lib/b.ts', `export const b = 1;\n`],
			]),
		);
		const text = buildAgentMermaid({ graph, source, limit: 40 });
		expect(text).not.toMatch(/\bzod\b/);
		expect(text).toContain('["src"]');
		expect(text).toContain('["lib"]');
	});

	it('ignores typeOnly edges for structure rollup', () => {
		const graph = buildGraph(
			files([
				[
					'pkg/a/a.ts',
					`import type { B } from '../../pkg/b/b';\nexport type A = B;\n`,
				],
				['pkg/b/b.ts', `export type B = number;\n`],
				// One runtime edge so graph is non-empty elsewhere
				[
					'pkg/c/c.ts',
					`import { x } from '../../pkg/d/d';\nexport const c = x;\n`,
				],
				['pkg/d/d.ts', `export const x = 1;\n`],
			]),
		);
		const text = buildAgentMermaid({ graph, source, limit: 40 });
		// a→b typeOnly should not create pkg/a → pkg/b edge
		expect(text).not.toMatch(/pkg\/a.*pkg\/b|pkg\/b.*pkg\/a/);
		expect(text).toContain('["pkg/c"]');
		expect(text).toContain('["pkg/d"]');
	});

	it('containment renders indexed paths without dependency or cycle output', () => {
		const graph = buildGraph(
			files([
				['src/core/a.ts', `import { b } from '../lib/b';\nexport const a = b;\n`],
				['src/lib/b.ts', `export const b = 1;\n`],
				['notes/readme.md', '# Notes\n'],
			]),
		);
		const text = buildAgentMermaid({
			graph,
			source,
			mode: 'containment',
			limit: 40,
		});

		expect(text).toMatch(/^flowchart TB/m);
		expect(text).toContain('mode=containment');
		expect(text).toContain('presentation=summary');
		expect(text).toContain('indexed paths only');
		// Path-true dir labels may include file counts
		expect(text).toMatch(/subgraph d\d+\["notes \(\d+ files\)"\]/);
		expect(text).toMatch(/subgraph d\d+\["src \(\d+ files\)"\]/);
		expect(text).toContain('["readme.md"]');
		expect(text).toContain('["a.ts"]');
		expect(text).toContain('["b.ts"]');
		expect(text).not.toMatch(/-->|<-->|cycles\.runtime/);
	});

	it('containment summary keeps late folders when early folders are dense', () => {
		// 10 files under a/ (dense) + one under z/ - summary must still show z
		const entries: Array<[string, string]> = [];
		for (let i = 0; i < 10; i++) {
			entries.push([`a/f${i}.ts`, `export const a${i} = ${i};\n`]);
		}
		entries.push(['z/core.ts', 'export const z = 1;\n']);
		const graph = buildGraph(files(entries));
		const text = buildAgentMermaid({
			graph,
			source,
			mode: 'containment',
			limit: 40,
		});

		expect(text).toContain('presentation=summary');
		expect(text).toMatch(/subgraph d\d+\["a \(\d+ files\)"\]/);
		expect(text).toMatch(/subgraph d\d+\["z \(\d+ files\)"\]/);
		// z is small → leaves expanded
		expect(text).toContain('["core.ts"]');
		expect(text).not.toMatch(/-->|<-->|cycles\.runtime/);
	});

	it('containment summary rolls dense folders (not every leaf)', () => {
		// Root depth 0 with > smallFolderMax files and only one top folder:
		// a/ keeps subdirs or rolls files when over threshold.
		const entries: Array<[string, string]> = [];
		for (let i = 0; i < 12; i++) {
			entries.push([`a/leaf${i}.ts`, `export const v${i} = ${i};\n`]);
		}
		// Nested late folder also present
		entries.push(['z/deep/core.ts', 'export const z = 1;\n']);
		const graph = buildGraph(files(entries));
		const text = buildAgentMermaid({
			graph,
			source,
			mode: 'containment',
			// High limit so failure is about rollup, not cap
			limit: 40,
		});

		expect(text).toContain('presentation=summary');
		expect(text).toMatch(/dense folders rolled/);
		// Dir skeleton includes both top folders
		expect(text).toMatch(/subgraph d\d+\["a \(\d+ files\)"\]/);
		expect(text).toMatch(/subgraph d\d+\["z \(\d+ files\)"\]/);
		// Dense a/ at depth 1 with 12 files → rolls file leaves (depth < 3)
		expect(text).not.toContain('["leaf0.ts"]');
		expect(text).not.toContain('["leaf11.ts"]');
		// z/deep is small → may expand core.ts
		expect(text).toContain('["core.ts"]');
		expect(text).toMatch(/truncated: showing .+ of 13 files as leaves/);
	});

	it('containment full + limit uses balanced selection (late folder kept)', () => {
		const graph = buildGraph(
			files([
				['a/deep/first.ts', 'export const a = 1;\n'],
				['a/deep/second.ts', 'export const a2 = 2;\n'],
				['b/mid.ts', 'export const b = 1;\n'],
				['z/last.ts', 'export const z = 1;\n'],
			]),
		);
		// Pure alpha at limit 2 would keep a/* only; balanced must keep a leaf from z or b
		const text = buildAgentMermaid({
			graph,
			source,
			mode: 'containment',
			presentation: 'full',
			limit: 2,
		});

		expect(text).toContain('presentation=full');
		expect(text).toMatch(/showing 2 of 4 files \(limit=2 · balanced\)/);
		// Round-robin by top segment a,b,z → first pass takes one from a and one from b
		expect(text).toMatch(/subgraph d\d+\["a \(\d+ files\)"\]/);
		expect(text).toMatch(/\["first\.ts"\]|\["second\.ts"\]/);
		// Late folder present under tight budget (not pure alpha starvation of a/* only)
		const hasB =
			/subgraph d\d+\["b \(\d+ files\)"\]/.test(text) ||
			text.includes('["mid.ts"]');
		const hasZ =
			/subgraph d\d+\["z \(\d+ files\)"\]/.test(text) ||
			text.includes('["last.ts"]');
		expect(hasB || hasZ).toBe(true);
		expect(text).not.toMatch(/-->|<-->|cycles\.runtime/);
	});

	it('containment limit zero emits honest headers without empty groups', () => {
		const graph = buildGraph(
			files([['src/a.ts', 'export const a = 1;\n']]),
		);
		const text = buildAgentMermaid({
			graph,
			source,
			mode: 'containment',
			limit: 0,
		});

		expect(text).toContain('showing 0 of 1 files (limit=0)');
		expect(text).toContain('presentation=summary');
		expect(text).not.toMatch(/subgraph|\bn\d+\["/);
	});
});
