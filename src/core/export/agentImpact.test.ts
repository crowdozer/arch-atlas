/**
 * Pure agent impact tests (no FS host / no git).
 */
import { describe, expect, it } from 'vitest';
import {
	AGENT_IMPACT_SCHEMA,
	buildAgentImpact,
	impactEdgeKey,
	indexFiles,
	type VirtualFile,
} from '@core/index.ts';

function vf(path: string, content: string): VirtualFile {
	return { path, content, byteLength: Buffer.byteLength(content) };
}

/** Minimal two-file chain: a → b */
function baseFiles(): VirtualFile[] {
	return [
		vf(
			'src/a.ts',
			`import { b } from './b';\nexport const a = b;\n`,
		),
		vf('src/b.ts', `export const b = 1;\n`),
		vf('package.json', `{"name":"impact-fixture","type":"module"}\n`),
	];
}

/** Head: add c, a→c, and d as new leaf; b gains an importer via a still */
function headFiles(): VirtualFile[] {
	return [
		vf(
			'src/a.ts',
			`import { b } from './b';\nimport { c } from './c';\nexport const a = b + c;\n`,
		),
		vf('src/b.ts', `export const b = 1;\n`),
		vf('src/c.ts', `export const c = 2;\n`),
		vf(
			'src/d.ts',
			`import { b } from './b';\nexport const d = b;\n`,
		),
		vf('package.json', `{"name":"impact-fixture","type":"module"}\n`),
	];
}

describe('impactEdgeKey', () => {
	it('omits line from equality key', () => {
		const k1 = impactEdgeKey({
			from: 'a',
			to: 'b',
			toKind: 'file',
			form: 'import',
		});
		const k2 = impactEdgeKey({
			from: 'a',
			to: 'b',
			toKind: 'file',
			form: 'import',
		});
		expect(k1).toBe(k2);
		expect(k1).not.toContain('line');
		expect(
			impactEdgeKey({
				from: 'a',
				to: 'b',
				toKind: 'package',
				form: 'import',
			}),
		).not.toBe(k1);
	});
});

describe('buildAgentImpact', () => {
	const base = indexFiles(baseFiles(), { catalog: { limit: 40 } });
	const head = indexFiles(headFiles(), { catalog: { limit: 40 } });

	it('emits schema v1 without contents or dual digests', () => {
		const impact = buildAgentImpact({
			base,
			head,
			refs: { base: 'HEAD^', head: 'HEAD', path: '/tmp/repo' },
			generatedAt: '2026-01-01T00:00:00.000Z',
			limit: 40,
		});

		expect(impact.schema).toBe(AGENT_IMPACT_SCHEMA);
		expect(impact.generatedAt).toBe('2026-01-01T00:00:00.000Z');
		expect(impact.analysis.tier).toBe('estimate');
		expect(impact.analysis.honesty).toMatch(/topology delta/i);
		expect(impact.analysis.honesty).toMatch(/not LSP/i);
		expect(impact.refs.base).toBe('HEAD^');
		expect(impact.refs.head).toBe('HEAD');

		const json = JSON.stringify(impact);
		expect(json).not.toContain('"contents"');
		expect(json).not.toContain('agent-digest');
		// no dual full digests
		expect(impact).not.toHaveProperty('baseDigest');
		expect(impact).not.toHaveProperty('headDigest');
	});

	it('reports file add and edge add deltas', () => {
		const impact = buildAgentImpact({
			base,
			head,
			refs: { base: 'b', head: 'h', path: '.' },
		});

		expect(impact.files.added).toEqual(
			expect.arrayContaining(['src/c.ts', 'src/d.ts']),
		);
		expect(impact.files.removed).toEqual([]);
		expect(impact.summary.delta.sourceCount).toBe(2);
		expect(impact.edges.addedCount).toBeGreaterThan(0);
		expect(
			impact.edges.added.some(
				(e) => e.from === 'src/a.ts' && e.to === 'src/c.ts',
			),
		).toBe(true);
		expect(
			impact.edges.added.some(
				(e) => e.from === 'src/d.ts' && e.to === 'src/b.ts',
			),
		).toBe(true);
		expect(impact.edges.removedCount).toBe(0);
	});

	it('surfaces degree movers when fan-in changes', () => {
		const impact = buildAgentImpact({
			base,
			head,
			refs: { base: 'b', head: 'h', path: '.' },
			limit: 10,
		});
		// b gains an importer (d); a gains outDegree
		const bMover = impact.degreeMovers.find((m) => m.path === 'src/b.ts');
		expect(bMover).toBeDefined();
		expect(bMover!.inDegreeHead).toBeGreaterThan(bMover!.inDegreeBase);
		const aMover = impact.degreeMovers.find((m) => m.path === 'src/a.ts');
		expect(aMover).toBeDefined();
		expect(aMover!.outDegreeHead).toBeGreaterThan(aMover!.outDegreeBase);
	});

	it('computes blast movers from full reverse metrics not catalog top-N', () => {
		const impact = buildAgentImpact({
			base,
			head,
			refs: { base: 'b', head: 'h', path: '.' },
			limit: 10,
		});
		// b should gain reverse reach when d imports it
		const bBlast = impact.blastMovers.find((m) => m.path === 'src/b.ts');
		expect(bBlast).toBeDefined();
		expect(bBlast!.reverseReachHead).toBeGreaterThan(
			bBlast!.reverseReachBase,
		);
	});

	it('reports file remove when head drops a source', () => {
		const reverse = buildAgentImpact({
			base: head,
			head: base,
			refs: { base: 'newer', head: 'older', path: '.' },
		});
		expect(reverse.files.removed).toEqual(
			expect.arrayContaining(['src/c.ts', 'src/d.ts']),
		);
		expect(reverse.edges.removedCount).toBeGreaterThan(0);
	});

	it('empty equal graphs yield zero edge delta', () => {
		const empty = indexFiles([], { catalog: { limit: 5 } });
		const impact = buildAgentImpact({
			base: empty,
			head: empty,
			refs: { base: 'a', head: 'b', path: '.' },
		});
		expect(impact.edges.addedCount).toBe(0);
		expect(impact.edges.removedCount).toBe(0);
		expect(impact.degreeMovers).toEqual([]);
		expect(impact.blastMovers).toEqual([]);
		expect(
			impact.warnings.some((w) => w.toLowerCase().includes('empty')),
		).toBe(true);
	});

	it('caps edge samples by limit but preserves full counts', () => {
		const impact = buildAgentImpact({
			base,
			head,
			refs: { base: 'b', head: 'h', path: '.' },
			limit: 1,
		});
		if (impact.edges.addedCount > 1) {
			expect(impact.edges.added.length).toBe(1);
			expect(impact.edges.addedCount).toBeGreaterThan(1);
			expect(
				impact.warnings.some((w) => w.includes('edges.added sample capped')),
			).toBe(true);
		}
	});
});
