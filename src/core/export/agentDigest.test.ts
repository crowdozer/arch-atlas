/**
 * Pure agent digest / file report tests (no FS host).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENT_DIGEST_SCHEMA,
	AGENT_FILE_SCHEMA,
	MIN_WHOLE,
	PUBLIC_MIN_RATIO,
	buildAgentDigest,
	buildAgentFileReport,
	buildAgentTree,
	fileLineCount,
	indexFiles,
	type VirtualFile,
} from '@core/index.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function walkFiles(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) {
			out.push(...walkFiles(full, base));
			continue;
		}
		const rel = path.relative(base, full).split(path.sep).join('/');
		const content = readFileSync(full, 'utf8');
		out.push({ path: rel, content, byteLength: Buffer.byteLength(content) });
	}
	return out;
}

describe('buildAgentDigest', () => {
	const files = walkFiles(path.join(fixturesRoot, 'demo-spaghetti-godfile'));
	const { graph, catalog } = indexFiles(files, { catalog: { limit: 40 } });

	it('emits schema v1 without contents or raw source fields', () => {
		const digest = buildAgentDigest({
			graph,
			catalog,
			source: { kind: 'directory', path: '/tmp/demo' },
			generatedAt: '2026-01-01T00:00:00.000Z',
			warnings: ['host-note'],
		});

		expect(digest.schema).toBe(AGENT_DIGEST_SCHEMA);
		expect(digest.generatedAt).toBe('2026-01-01T00:00:00.000Z');
		expect(digest.analysis.tier).toBe('estimate');
		expect(digest.analysis.honesty).toMatch(/not LSP/i);
		expect(digest.summary.sourceCount).toBeGreaterThan(15);
		expect(digest.warnings).toContain('host-note');
		expect(digest.catalog.blastRadius.length).toBeGreaterThan(0);
		expect(digest.catalog.spines.length).toBeGreaterThan(0);
		expect(digest.catalog.publicMass).toEqual([]);
		expect(digest.catalog.icebergs).toEqual([]);
		expect(digest.analysis.spineFormula).toBe('modules-then-in');
		expect(digest.graph.files.some((f) => f.path === 'src/god/hub.ts')).toBe(
			true,
		);
		expect(digest.graph.edges.length).toBe(graph.edges.length);

		const json = JSON.stringify(digest);
		expect(json).not.toContain('"contents"');
		// no full source dump of hub
		const hubSrc = graph.contents.get('src/god/hub.ts') ?? '';
		if (hubSrc.length > 40) {
			expect(json).not.toContain(hubSrc.slice(0, 40));
		}
	});

	it('exact mode re-ranks fileLoc by export-surface LOC', () => {
		const hubPath = 'src/god/hub.ts';
		const hubWhole = fileLineCount(graph, hubPath);
		// Deliberate law: hub whole ≥ floor and surface = whole → public mass
		expect(hubWhole).toBeGreaterThanOrEqual(MIN_WHOLE);
		const hubSurface = hubWhole; // ratio 1.0 ≥ PUBLIC_MIN_RATIO
		const exportSurfaceLoc = new Map<string, number>();
		for (const f of graph.files.values()) {
			if (!f.isSource) continue;
			// Hub dominates export-surface ranking; surface = whole for public-mass membership
			exportSurfaceLoc.set(f.path, f.path === hubPath ? hubSurface : 1);
		}
		const digest = buildAgentDigest({
			graph,
			catalog,
			source: { kind: 'directory', path: '/tmp/demo' },
			exact: {
				engineSource: 'local',
				classicAst: true,
				exportSurfaceLoc,
			},
		});
		expect(digest.analysis.tier).toBe('exact');
		expect(digest.analysis.locMetric).toBe('export-surface');
		expect(digest.analysis.engine?.source).toBe('local');
		expect(digest.catalog.fileLoc[0]?.path).toBe(hubPath);
		expect(digest.catalog.fileLoc[0]?.loc).toBe(hubSurface);
		expect(digest.catalogEstimateFileLoc?.length).toBeGreaterThan(0);
		// topology bins unchanged vs estimate catalog
		expect(digest.catalog.blastRadius).toEqual(catalog.blastRadius);
		expect(digest.catalog.spines).toEqual(catalog.spines);
		// Exact fills mass bins: hub is public mass under forced ratio = 1
		const hubMass = digest.catalog.publicMass.find((r) => r.path === hubPath);
		expect(hubMass).toBeDefined();
		expect(hubMass!.surfaceLoc).toBe(hubSurface);
		expect(hubMass!.wholeLoc).toBe(hubWhole);
		expect(hubMass!.ratio).toBeGreaterThanOrEqual(PUBLIC_MIN_RATIO);
		// Hub is not an iceberg at ratio 1.0
		expect(digest.catalog.icebergs.some((r) => r.path === hubPath)).toBe(false);
	});

	it('respects catalog limit from index', () => {
		const small = indexFiles(files, { catalog: { limit: 3 } });
		const digest = buildAgentDigest({
			graph: small.graph,
			catalog: small.catalog,
			source: { kind: 'directory', path: 'x' },
		});
		expect(digest.catalog.hotspots.length).toBeLessThanOrEqual(3);
		expect(digest.catalog.fileLoc.length).toBeLessThanOrEqual(3);
		expect(digest.catalog.blastRadius.length).toBeLessThanOrEqual(3);
	});

	it('ranks spaghetti hub among blast/hotspots when limit is high enough', () => {
		const digest = buildAgentDigest({
			graph,
			catalog,
			source: { kind: 'zip', path: 'fixture.zip' },
		});
		const blastPaths = digest.catalog.blastRadius.map((b) => b.path);
		const hotPaths = digest.catalog.hotspots.map((h) => h.path);
		// hub is reverse-reach dense in this fixture
		expect(
			blastPaths.includes('src/god/hub.ts') ||
				hotPaths.includes('src/god/hub.ts') ||
				digest.catalog.complex.some((c) => c.path === 'src/god/hub.ts'),
		).toBe(true);
	});
});

describe('buildAgentFileReport', () => {
	const files = walkFiles(path.join(fixturesRoot, 'demo-spaghetti-godfile'));
	const { graph, catalog } = indexFiles(files, { catalog: { limit: 40 } });

	it('reports degrees and neighbors for hub without source', () => {
		const report = buildAgentFileReport({
			graph,
			catalog,
			source: { kind: 'directory', path: '/tmp/demo' },
			filePath: 'src/god/hub.ts',
			generatedAt: '2026-01-01T00:00:00.000Z',
		});
		expect(report.schema).toBe(AGENT_FILE_SCHEMA);
		expect(report.exists).toBe(true);
		expect(report.isSource).toBe(true);
		expect((report.outDegree ?? 0) + (report.inDegree ?? 0)).toBeGreaterThan(0);
		expect(report.imports?.length ?? 0).toBeGreaterThan(0);
		const json = JSON.stringify(report);
		const hubSrc = graph.contents.get('src/god/hub.ts') ?? '';
		if (hubSrc.length > 40) {
			expect(json).not.toContain(hubSrc.slice(0, 40));
		}
	});

	it('marks missing path exists=false', () => {
		const report = buildAgentFileReport({
			graph,
			catalog,
			source: { kind: 'directory', path: 'x' },
			filePath: 'no/such/file.ts',
		});
		expect(report.exists).toBe(false);
		expect(report.warnings.some((w) => w.includes('not in graph'))).toBe(true);
	});
});

describe('buildAgentTree', () => {
	it('builds hierarchical tree for spaghetti fixture', () => {
		const files = walkFiles(path.join(fixturesRoot, 'demo-spaghetti-godfile'));
		const { graph } = indexFiles(files);
		const out = buildAgentTree({
			graph,
			source: { kind: 'directory', path: 'demo' },
		});
		expect(out.schema).toBe('arch-atlas.agent-tree.v1');
		expect(out.tree.kind).toBe('dir');
		expect(out.tree.children.some((c) => c.name === 'src')).toBe(true);
	});
});
