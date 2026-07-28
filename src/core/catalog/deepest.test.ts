import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	catalogComplex,
	catalogDeepest,
	fileDistances,
	fileImportAdj,
	fileLongestDistances,
	importDepthStats,
} from '@core/catalog/deepest.ts';
import type { CodeGraph, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectFileHub } from '@core/view/fileHub.ts';

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

/** Minimal CodeGraph shell for adj-only longest-path tests. */
function graphStub(): CodeGraph {
	return {
		files: new Map(),
		packages: new Map(),
		edges: [],
		contents: new Map(),
		stats: {
			fileCount: 0,
			packageCount: 0,
			edgeCount: 0,
			sourceCount: 0,
			unresolvedCount: 0,
		},
	} as CodeGraph;
}

/**
 * Brute-force longest simple-path distances (always-expand DFS).
 * Exact oracle for tiny graphs; same contract as fileLongestDistances.
 */
function bruteLongestSimple(
	adj: Map<string, string[]>,
	start: string,
	maxDepth = Number.POSITIVE_INFINITY,
): Map<string, number> {
	const dist = new Map<string, number>([[start, 0]]);
	const dfs = (cur: string, depth: number, stack: Set<string>) => {
		if (depth >= maxDepth) return;
		for (const n of adj.get(cur) ?? []) {
			if (stack.has(n)) continue;
			const nd = depth + 1;
			if ((dist.get(n) ?? -1) < nd) dist.set(n, nd);
			stack.add(n);
			dfs(n, nd, stack);
			stack.delete(n);
		}
	};
	dfs(start, 0, new Set([start]));
	return dist;
}

function permuteAdj(
	adj: Map<string, string[]>,
	order: 'id' | 'rev' | 'shuffle',
	seed = 1,
): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const [k, vs] of adj) {
		const copy = [...vs];
		if (order === 'id') copy.sort((a, b) => a.localeCompare(b));
		else if (order === 'rev') copy.sort((a, b) => b.localeCompare(a));
		else {
			// deterministic LCG shuffle
			let s = seed + k.length * 17;
			for (let i = copy.length - 1; i > 0; i--) {
				s = (s * 1103515245 + 12345) & 0x7fffffff;
				const j = s % (i + 1);
				[copy[i], copy[j]] = [copy[j]!, copy[i]!];
			}
		}
		out.set(k, copy);
	}
	return out;
}

describe('fileLongestDistances', () => {
	it('expands format→types when types is also a direct dep (UserCard)', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-react-simple')),
		);
		const id = 'src/components/UserCard.tsx';
		const adj = fileImportAdj(graph);
		const short = fileDistances(graph, id, adj);
		const long = fileLongestDistances(graph, id, adj);
		expect(short.dist.get('src/types.ts')).toBe(1);
		expect(short.maxHops).toBe(1);
		expect(long.dist.get('src/lib/format.ts')).toBe(1);
		expect(long.dist.get('src/types.ts')).toBe(2);
		expect(long.maxHops).toBe(2);
	});

	it('cyclic diamond: root→b→a→c is depth 3 (not only root→a→c at 2)', () => {
		// Counterexample: global memo of best-depth-so-far under-reported c.
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'scene-cyclic-depth')),
		);
		const start = 'src/root.ts';
		const adj = fileImportAdj(graph);
		const { dist, maxHops } = fileLongestDistances(graph, start, adj);
		// Longest arrivals: a via root→b→a (2), b via root→a→b (2), c via root→b→a→c (3)
		expect(dist.get('src/a.ts')).toBe(2);
		expect(dist.get('src/b.ts')).toBe(2);
		expect(dist.get('src/c.ts')).toBe(3);
		expect(maxHops).toBe(3);
	});

	it('adjacency order does not change longest distances', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'scene-cyclic-depth')),
		);
		const start = 'src/root.ts';
		const base = fileImportAdj(graph);
		const results = (['id', 'rev', 'shuffle'] as const).map((order) => {
			const adj = permuteAdj(base, order, 42);
			return fileLongestDistances(graph, start, adj);
		});
		const ref = results[0]!;
		for (const r of results) {
			expect([...r.dist.entries()].sort()).toEqual(
				[...ref.dist.entries()].sort(),
			);
			expect(r.maxHops).toBe(ref.maxHops);
		}
	});

	it('matches brute-force simple-path oracle on small synthetic adj', () => {
		// Small graphs with diamonds, branches, and a cycle
		const graphs: Map<string, string[]>[] = [
			new Map([
				['r', ['a', 'b']],
				['a', ['b', 'c']],
				['b', ['a']],
				['c', []],
			]),
			new Map([
				['s', ['t', 'u']],
				['t', ['u', 'v']],
				['u', ['v']],
				['v', ['t']],
			]),
			new Map([
				['x', ['y']],
				['y', ['z']],
				['z', ['y', 'w']],
				['w', []],
			]),
		];
		const g = graphStub();
		for (const adj of graphs) {
			const start = [...adj.keys()][0]!;
			for (const order of ['id', 'rev', 'shuffle'] as const) {
				const permuted = permuteAdj(adj, order, 7);
				const got = fileLongestDistances(g, start, permuted);
				const oracle = bruteLongestSimple(permuted, start);
				expect([...got.dist.entries()].sort()).toEqual(
					[...oracle.entries()].sort(),
				);
			}
		}
	});

	it('maxDepth bounds search and still reports longest within the bound', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'scene-cyclic-depth')),
		);
		const start = 'src/root.ts';
		const adj = fileImportAdj(graph);
		const unbounded = fileLongestDistances(graph, start, adj);
		const capped2 = fileLongestDistances(graph, start, adj, { maxDepth: 2 });
		const capped3 = fileLongestDistances(graph, start, adj, { maxDepth: 3 });
		expect(capped2.dist.get('src/c.ts')).toBe(2);
		expect(capped2.maxHops).toBe(2);
		expect(capped3.dist.get('src/c.ts')).toBe(3);
		expect(capped3.maxHops).toBe(unbounded.maxHops);
	});

	it('terminates on a mutual-import SCC', () => {
		const adj = new Map<string, string[]>([
			['a', ['b']],
			['b', ['a', 'c']],
			['c', ['a']],
		]);
		const { dist, maxHops } = fileLongestDistances(graphStub(), 'a', adj);
		// a→b→c = 2; a→b→a blocked; a→b→c→a blocked
		expect(dist.get('b')).toBe(1);
		expect(dist.get('c')).toBe(2);
		expect(maxHops).toBe(2);
	});
});

describe('fileLongestDistances → hub radius (Phase 1A)', () => {
	it('cyclic scene opens Import hop 3 multi-instances when radius ≥ 3', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'scene-cyclic-depth')),
		);
		const payload = projectFileHub(graph, 'src/root.ts', {
			maxDepth: 4,
			weightAxis: 'import-edges',
		});
		expect(payload).not.toBeNull();
		const hop3 = payload!.options.alluvial.nodes.filter(
			(n) => n.category === 'Import hop 3',
		);
		// Before 1A maxHops=2 capped radius — no hop-3 column. After: a/b multi-instances.
		expect(hop3.length).toBeGreaterThan(0);
		// c may still be absent under unit-mass scarce fan-out (Phase 1B)
	});
});

describe('catalogDeepest / importDepthStats', () => {
	it('ranks next-complex by max hops descending', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const deep = catalogDeepest(graph);
		expect(deep.length).toBeGreaterThan(3);
		for (let i = 1; i < deep.length; i++) {
			expect(deep[i - 1]!.maxHops).toBeGreaterThanOrEqual(deep[i]!.maxHops);
		}
		expect(deep[0]!.maxHops).toBeGreaterThanOrEqual(2);
		expect(catalog.deepest[0]!.path).toBe(deep[0]!.path);
	});

	it('stripe webhook is deeper than logger leaf', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const stripe = importDepthStats(graph, 'app/api/webhooks/stripe/route.ts');
		const logger = importDepthStats(graph, 'src/lib/logger.ts');
		expect(stripe.maxHops).toBeGreaterThan(logger.maxHops);
		expect(logger.maxHops).toBe(0);
		expect(stripe.reachableFiles).toBeGreaterThan(5);
		expect(stripe.packageEnds).toBeGreaterThan(2);
	});

	it('leaves are excluded from tree-depth list', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const deep = catalogDeepest(graph);
		expect(deep.every((d) => d.maxHops >= 1)).toBe(true);
		expect(deep.some((d) => d.path === 'src/lib/logger.ts')).toBe(false);
	});
});

describe('catalogComplex', () => {
	it('ranks by downwindEdges descending', () => {
		const { graph, catalog } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const complex = catalogComplex(graph);
		expect(complex.length).toBeGreaterThan(3);
		for (let i = 1; i < complex.length; i++) {
			expect(complex[i - 1]!.downwindEdges).toBeGreaterThanOrEqual(
				complex[i]!.downwindEdges,
			);
		}
		expect(complex[0]!.downwindEdges).toBeGreaterThan(0);
		expect(catalog.complex[0]!.path).toBe(complex[0]!.path);
	});

	it('counts file + package edges (start→page→pkg style mass)', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		// stripe webhook: many file hops + packages; downwindEdges > packageEnds
		const stripe = catalogComplex(graph).find(
			(c) => c.path === 'app/api/webhooks/stripe/route.ts',
		);
		expect(stripe).toBeTruthy();
		expect(stripe!.downwindEdges).toBeGreaterThan(stripe!.packageEnds);
		// downwindEdges is at least package ends + some file edges in the tree
		expect(stripe!.downwindEdges).toBeGreaterThanOrEqual(
			stripe!.packageEnds + (stripe!.reachableFiles - 1 > 0 ? 1 : 0),
		);
	});

	it('uses downwindEdges as primary rank (not maxHops alone)', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const complex = catalogComplex(graph);
		expect(complex[0]!.downwindEdges).toBe(
			Math.max(...complex.map((c) => c.downwindEdges)),
		);
		expect(complex.every((c) => c.downwindEdges >= 1)).toBe(true);
	});
});
