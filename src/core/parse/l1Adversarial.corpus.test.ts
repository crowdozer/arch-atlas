/**
 * Adversarial L1 corpus: every top-level fixtures/* project → buildGraph →
 * zero garbage package / non-path unresolved externals.
 *
 * Demos are fair corpus inputs (not L1 minimize SoT). Golden-l1-* also re-run
 * explicitly (belt-and-suspenders with goldenL1.integration.test.ts).
 *
 * If this fails: fix extract/resolve root cause - do not weaken l1GarbageSpec.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import {
	collectGarbageExternals,
	formatGarbageHits,
} from '@core/parse/l1GarbageSpec.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function loadFixtureDir(dir: string, prefix = ''): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const rel = prefix ? `${prefix}/${name}` : name;
		if (statSync(full).isDirectory()) {
			out.push(...loadFixtureDir(full, rel));
		} else {
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel.replace(/\\/g, '/'),
				content,
				byteLength: content.length,
			});
		}
	}
	return out;
}

/** Top-level project directories under fixtures/ (skip files if any). */
function listFixtureProjects(): string[] {
	return readdirSync(fixturesRoot)
		.filter((name) => {
			const full = path.join(fixturesRoot, name);
			return statSync(full).isDirectory();
		})
		.sort();
}

function expectNoGarbage(label: string, files: VirtualFile[]): void {
	const graph = buildGraph(files);
	const hits = collectGarbageExternals(graph);
	expect(
		hits,
		`${label}: expected zero garbage externals, got ${hits.length}:\n${formatGarbageHits(hits)}\n` +
			`(packages: ${[...graph.packages.keys()].join(', ') || '(none)'})`,
	).toEqual([]);
}

describe('L1 adversarial corpus (fixtures/*)', () => {
	const projects = listFixtureProjects();

	it('discovers at least the known golden + demo projects', () => {
		expect(projects).toEqual(expect.arrayContaining([
			'golden-l1-js-ts',
			'golden-l1-python',
			'golden-l1-astro',
			'demo-next-complex',
			'demo-python-app',
			'demo-react-simple',
			'demo-spaghetti-godfile',
			'sample-ts-project',
			'sample-python-project',
			'codebreaker-focus',
			'agent-artillery-shaped',
		]));
		expect(projects.length).toBeGreaterThanOrEqual(11);
	});

	for (const name of listFixtureProjects()) {
		it(`buildGraph(${name}) has zero garbage externals`, () => {
			const files = loadFixtureDir(path.join(fixturesRoot, name));
			expect(files.length, `${name}: empty fixture tree`).toBeGreaterThan(0);
			expectNoGarbage(name, files);
		});
	}
});

describe('L1 adversarial corpus (golden-l1 belt)', () => {
	for (const name of ['golden-l1-js-ts', 'golden-l1-python', 'golden-l1-astro'] as const) {
		it(`${name}: no | / kind soup packages`, () => {
			const files = loadFixtureDir(path.join(fixturesRoot, name));
			const graph = buildGraph(files);
			expect(graph.packages.has('|')).toBe(false);
			const hits = collectGarbageExternals(graph);
			expect(
				hits,
				`${name}:\n${formatGarbageHits(hits)}`,
			).toEqual([]);
		});
	}
});
