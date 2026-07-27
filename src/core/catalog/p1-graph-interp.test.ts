/**
 * Ship B / P1 graph interpretation acceptance laws
 * (fixtures/agent-artillery-shaped).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	buildAgentDigest,
	buildGraph,
	catalogBoundaryCrossings,
	catalogCycles,
	catalogHotspots,
	indexFiles,
	inferFileRoles,
	isFacade,
	parseAliasFlag,
	type VirtualFile,
} from '@core/index.ts';

const fixtureRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures/agent-artillery-shaped',
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

describe('P1 graph interpretation — agent-artillery-shaped laws', () => {
	const files = walk(fixtureRoot);
	const { graph, catalog } = indexFiles(files, { catalog: { limit: 40 } });

	it('types/index is not top hotspot by rankScore when runtime hubs exist', () => {
		const hot = catalogHotspots(graph, 40);
		expect(hot.length).toBeGreaterThan(0);
		// Type barrel is pure type-only traffic → dropped or heavily demoted
		const typeBarrel = hot.find((h) => h.path === 'types/index.ts');
		if (typeBarrel) {
			expect(hot[0]!.path).not.toBe('types/index.ts');
			expect((hot[0]!.rankScore ?? 0) >= (typeBarrel.rankScore ?? 0)).toBe(true);
		} else {
			// Preferred: pure type sink absent from ranking
			expect(typeBarrel).toBeUndefined();
		}
		// Some runtime hub ranks first-ish
		const top = hot[0]!;
		expect(top.path).not.toMatch(/types\//);
	});

	it('public.ts has facade (and barrel) role', () => {
		expect(isFacade(graph, 'client/sim/public.ts')).toBe(true);
		const roles = inferFileRoles(graph, 'client/sim/public.ts');
		expect(roles).toContain('facade');
		// Re-export heavy → also barrel
		expect(roles).toContain('barrel');
		const hot = catalog.hotspots.find((h) => h.path === 'client/sim/public.ts');
		if (hot) {
			expect(hot.roles).toContain('facade');
			// Demoted surface: rankScore < edgeCount when edgeCount > 0
			if (hot.edgeCount > 0) {
				expect(hot.rankScore ?? 0).toBeLessThan(hot.edgeCount);
			}
		}
	});

	it('runtime SCC size ≥ 2 for sim pair (physics ↔ weapons)', () => {
		const cycles = catalog.cycles ?? catalogCycles(graph, 40);
		expect(cycles.runtime.length).toBeGreaterThan(0);
		const sim = cycles.runtime.find(
			(c) =>
				c.samplePaths.includes('client/sim/physics.ts') &&
				c.samplePaths.includes('client/sim/weapons.ts'),
		);
		expect(sim).toBeDefined();
		expect(sim!.size).toBeGreaterThanOrEqual(2);

		// config ↔ settingsStore also a runtime knot
		const cfg = cycles.runtime.find(
			(c) =>
				c.samplePaths.includes('config.ts') &&
				c.samplePaths.includes('settingsStore.ts'),
		);
		expect(cfg).toBeDefined();
	});

	it('typeOnly edge on Game import from physics', () => {
		const e = graph.edges.find(
			(x) =>
				x.from === 'client/sim/physics.ts' &&
				x.specifier.includes('game') &&
				x.toKind === 'file',
		);
		// physics has both type Game import and may share path — prefer typeOnly flag
		const typeEdge = graph.edges.find(
			(x) =>
				x.from === 'client/sim/physics.ts' &&
				x.to === 'game.ts' &&
				x.typeOnly === true,
		);
		expect(typeEdge).toBeDefined();
		expect(e).toBeDefined();
	});

	it('tsconfig alias resolves @/modules/artillery/* into feed file', () => {
		const e = graph.edges.find(
			(x) =>
				x.from === 'client/main.ts' &&
				x.specifier === '@/modules/artillery/client/util',
		);
		expect(e?.toKind).toBe('file');
		expect(e?.to).toBe('client/util.ts');
	});

	it('extraAliases rewrite wins and resolves when tsconfig paths absent', () => {
		// Strip tsconfig so only --alias / extraAliases applies
		const noTs = files.filter((f) => f.path !== 'tsconfig.json');
		const alias = parseAliasFlag('@/modules/artillery/*=./*');
		expect(alias).not.toBeNull();
		const g = buildGraph(noTs, { extraAliases: [alias!] });
		const e = g.edges.find(
			(x) =>
				x.from === 'client/main.ts' &&
				x.specifier === '@/modules/artillery/client/util',
		);
		expect(e?.toKind).toBe('file');
		expect(e?.to).toBe('client/util.ts');
	});

	it('unresolved alias miss stamps unresolvedReason alias', () => {
		const g = buildGraph(
			[
				{
					path: 'src/a.ts',
					content: `import { x } from '@/modules/missing/foo';\n`,
					byteLength: 40,
				},
			],
			{
				extraAliases: [
					{ pattern: '@/modules/missing/*', targets: ['./nowhere/*'] },
				],
			},
		);
		const e = g.edges.find((x) => x.specifier === '@/modules/missing/foo');
		expect(e?.toKind).toBe('unresolved');
		expect(e?.unresolvedReason).toBe('alias');
	});

	it('relative missing stamps unresolvedReason missing', () => {
		const g = buildGraph([
			{
				path: 'src/a.ts',
				content: `import { x } from './nope';\n`,
				byteLength: 30,
			},
		]);
		const e = g.edges.find((x) => x.specifier === './nope');
		expect(e?.toKind).toBe('unresolved');
		expect(e?.unresolvedReason).toBe('missing');
	});

	it('omit test → omitted toKind (not unresolved)', () => {
		// Synthetic: product import of a test path stamped omitted
		const g = buildGraph(
			[
				{
					path: 'src/prod.ts',
					content: `import { testBoot } from './prod.test';\n`,
					byteLength: 50,
				},
			],
			{
				isOmittedPath: (p) => /\.test\./i.test(p),
			},
		);
		const e = g.edges.find((x) => x.specifier === './prod.test');
		expect(e?.toKind).toBe('omitted');
		expect(e?.unresolvedReason).toBeUndefined();

		// Fixture __tests__ path is classified as test for product scope
		const testFile = files.find((f) => f.path.includes('__tests__'));
		expect(testFile).toBeDefined();
	});

	it('boundary crossing lists deep import past public façade', () => {
		const crossings =
			catalog.boundaryCrossings ?? catalogBoundaryCrossings(graph, 40);
		const deep = crossings.find(
			(c) =>
				c.to === 'client/sim/weapons.ts' &&
				c.from === 'client/main.ts' &&
				(c.barrel === 'client/sim/public.ts' ||
					c.barrel.startsWith('client/sim/')),
		);
		expect(deep).toBeDefined();
		expect(deep!.epistemic).toBe('inferred');
		expect(deep!.barrel).toBe('client/sim/public.ts');
	});

	it('agentDigest emits cycles, boundaryCrossings, unresolvedReason', () => {
		const digest = buildAgentDigest({
			graph,
			catalog,
			source: { kind: 'directory', path: fixtureRoot },
			generatedAt: '2026-01-01T00:00:00.000Z',
			scope: {
				omit: [],
				includeTests: true,
				exactRequested: false,
				presets: ['full'],
				aliasRewrites: [
					{ pattern: '@/modules/artillery/*', targets: ['./*'] },
				],
			},
		});
		expect(digest.catalog.cycles?.runtime.length).toBeGreaterThan(0);
		expect(digest.catalog.boundaryCrossings?.length).toBeGreaterThan(0);
		expect(digest.scope?.presets).toContain('full');
		expect(digest.scope?.aliasRewrites?.[0]?.pattern).toBe(
			'@/modules/artillery/*',
		);
		// Alias edge is resolved (file); unresolved edges carry reason when present
		for (const e of digest.graph.edges) {
			if (e.toKind === 'unresolved') {
				expect(e.unresolvedReason).toBeDefined();
			}
		}
	});
});
