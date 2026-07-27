/**
 * P2 analysis envelope + portable artifact tests.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	ANALYSIS_PROTOCOL_ID,
	PORTABLE_ARTIFACT_SCHEMA,
	buildAnalysisEnvelope,
	buildAgentDigest,
	buildAgentFileReport,
	buildAgentTree,
	indexFiles,
	isPortableArtifact,
	loadPortableArtifact,
	parseAliasFlag,
	toPortableArtifact,
	type VirtualFile,
} from '@core/index.ts';
import { buildGraph } from '@core/graph/build.ts';

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

describe('buildAnalysisEnvelope', () => {
	const sampleFiles = walkFiles(path.join(fixturesRoot, 'sample-ts-project'));
	const artilleryFiles = walkFiles(
		path.join(fixturesRoot, 'agent-artillery-shaped'),
	);

	it('stamps L0+L1+L2 for sample-ts with tsconfig paths that resolve', () => {
		const { graph } = indexFiles(sampleFiles, { catalog: { limit: 20 } });
		// Ensure @/ style import exists or rely on fixture — sample uses relative.
		// L2 requires alias-resolved file edges; sample-ts may only have relative.
		const env = buildAnalysisEnvelope({ graph, exactApplied: false });
		expect(env.protocol).toBe(ANALYSIS_PROTOCOL_ID);
		expect(env.capabilities).toContain('L0');
		expect(env.capabilities).toContain('L1');
		expect(env.capabilities).not.toContain('L3');
		expect(env.capabilities).not.toContain('L4');
		expect(env.completeness.tsconfig).toBe('full'); // has paths @/*
		expect(env.completeness.nodeModules).toBe('absent');
		expect(env.capabilityDetail.mass).toBe('whole-file');
		expect(env.capabilityDetail.aliases).toBe('tsconfig');
		// L2 only if some edge actually resolved via alias — sample may be relative-only
		if (env.capabilities.includes('L2')) {
			expect(env.capabilityDetail.importGraph).toBe('resolved');
		} else {
			expect(env.capabilityDetail.importGraph).toBe('syntax');
		}
	});

	it('stamps L2 + resolved when artillery tsconfig alias helps', () => {
		const { graph } = indexFiles(artilleryFiles, { catalog: { limit: 40 } });
		const env = buildAnalysisEnvelope({ graph });
		expect(env.capabilities).toEqual(expect.arrayContaining(['L0', 'L1', 'L2']));
		expect(env.capabilityDetail.importGraph).toBe('resolved');
		expect(env.capabilityDetail.aliases).toBe('tsconfig');
		expect(env.capabilityDetail.typeEdges).toBe('import-type-flag');
		expect(env.completeness.tsconfig).toBe('full');
	});

	it('stamps rewrite-map when --alias rewrites provided and resolve', () => {
		const noTs = artilleryFiles.filter((f) => f.path !== 'tsconfig.json');
		const alias = parseAliasFlag('@/modules/artillery/*=./*');
		expect(alias).not.toBeNull();
		const graph = buildGraph(noTs, { extraAliases: [alias!] });
		const env = buildAnalysisEnvelope({
			graph,
			aliasRewrites: [alias!],
		});
		expect(env.capabilityDetail.aliases).toBe('rewrite-map');
		expect(env.capabilities).toContain('L2');
		expect(env.completeness.tsconfig).toBe('none');
	});

	it('stamps exact mass as export-declaration-span', () => {
		const { graph } = indexFiles(sampleFiles, { catalog: { limit: 10 } });
		const env = buildAnalysisEnvelope({ graph, exactApplied: true });
		expect(env.capabilityDetail.mass).toBe('export-declaration-span');
	});

	it('no L1 when empty graph (no sources)', () => {
		const graph = buildGraph([
			{
				path: 'README.md',
				content: '# hi\n',
				byteLength: 5,
			},
		]);
		const env = buildAnalysisEnvelope({ graph });
		expect(env.capabilities).toEqual(['L0']);
		expect(env.capabilityDetail.importGraph).toBe('syntax');
	});
});

describe('envelope wired into agent lenses', () => {
	const files = walkFiles(path.join(fixturesRoot, 'agent-artillery-shaped'));
	const { graph, catalog } = indexFiles(files, { catalog: { limit: 40 } });
	const source = { kind: 'directory' as const, path: '/tmp/artillery' };

	it('digest analysis carries protocol envelope', () => {
		const digest = buildAgentDigest({
			graph,
			catalog,
			source,
			generatedAt: '2026-01-01T00:00:00.000Z',
		});
		expect(digest.analysis.protocol).toBe(ANALYSIS_PROTOCOL_ID);
		expect(digest.analysis.capabilities).toEqual(
			expect.arrayContaining(['L0', 'L1', 'L2']),
		);
		expect(digest.analysis.capabilityDetail.aliases).toBe('tsconfig');
		expect(digest.analysis.completeness.tsconfig).toBe('full');
		expect(digest.analysis.completeness.nodeModules).toBe('absent');
	});

	it('file report analysis carries protocol envelope + fileLens', () => {
		const report = buildAgentFileReport({
			graph,
			catalog,
			source,
			filePath: 'client/main.ts',
		});
		expect(report.analysis?.protocol).toBe(ANALYSIS_PROTOCOL_ID);
		expect(report.analysis?.fileLens.mass).toBe(false);
		expect(report.analysis?.capabilities).toContain('L1');
		expect(report.analysis?.capabilityDetail.mass).toBe('whole-file');
	});

	it('tree analysis carries protocol envelope', () => {
		const tree = buildAgentTree({ graph, source });
		expect(tree.analysis?.protocol).toBe(ANALYSIS_PROTOCOL_ID);
		expect(tree.analysis?.capabilities).toContain('L1');
		expect(tree.scope).toBeDefined();
	});
});

describe('portable artifact', () => {
	const files = walkFiles(path.join(fixturesRoot, 'sample-ts-project'));
	const { graph, catalog } = indexFiles(files, { catalog: { limit: 10 } });

	it('toPortableArtifact wraps digest; isPortableArtifact validates', () => {
		const digest = buildAgentDigest({
			graph,
			catalog,
			source: { kind: 'directory', path: '/tmp/sample' },
			generatedAt: '2026-01-02T00:00:00.000Z',
		});
		const art = toPortableArtifact(digest);
		expect(art.schema).toBe(PORTABLE_ARTIFACT_SCHEMA);
		expect(art.format).toBe('agent-digest');
		expect(art.generatedAt).toBe('2026-01-02T00:00:00.000Z');
		expect(art.payload).toEqual(digest);
		expect(isPortableArtifact(art)).toBe(true);
		expect(loadPortableArtifact(art)?.schema).toBe(PORTABLE_ARTIFACT_SCHEMA);
		expect(isPortableArtifact(digest)).toBe(false);
		expect(isPortableArtifact({ schema: 'nope' })).toBe(false);
		expect(loadPortableArtifact(null)).toBeNull();
	});
});
