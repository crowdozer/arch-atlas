/**
 * Agent Pack assembly: CLI-parity bare digest from session-shaped inputs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENT_DIGEST_SCHEMA,
	indexFiles,
	type VirtualFile,
} from '@core/index.ts';
import {
	agentPackFilename,
	buildAgentPackDigest,
	DEFAULT_AGENT_PACK_SOURCE,
	programMetaToAgentInput,
} from './agentPackDownload.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../fixtures',
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

describe('buildAgentPackDigest', () => {
	const files = walkFiles(path.join(fixturesRoot, 'demo-spaghetti-godfile'));
	const { graph, catalog } = indexFiles(files, { catalog: { limit: 40 } });

	it('emits agent-digest.v1 schema without contents or source text', () => {
		const digest = buildAgentPackDigest({
			graph,
			catalog,
			source: { kind: 'zip', path: 'demo-spaghetti.zip' },
			warnings: ['host-note'],
			includeTests: false,
			generatedAt: '2026-01-01T00:00:00.000Z',
		});

		expect(digest.schema).toBe(AGENT_DIGEST_SCHEMA);
		expect(digest.schema).toBe('arch-atlas.agent-digest.v1');
		expect(digest.generatedAt).toBe('2026-01-01T00:00:00.000Z');
		expect(digest.source).toEqual({
			kind: 'zip',
			path: 'demo-spaghetti.zip',
		});
		expect(digest.warnings).toContain('host-note');
		expect(digest.scope?.includeTests).toBe(false);
		expect(digest.scope?.exactRequested).toBe(false);
		expect(digest.scope?.exactApplied).toBe(false);
		expect(digest.scope?.feedKind).toBe('zip');

		const json = JSON.stringify(digest);
		expect(json).not.toContain('"contents"');
		const hubSrc = graph.contents.get('src/god/hub.ts') ?? '';
		if (hubSrc.length > 40) {
			expect(json).not.toContain(hubSrc.slice(0, 40));
		}
	});

	it('omits Exact honesty when exact is not provided (web estimate-first)', () => {
		const digest = buildAgentPackDigest({
			graph,
			catalog,
			source: DEFAULT_AGENT_PACK_SOURCE,
			includeTests: true,
			// exactRequested true but no mass — chrome selected, not applied
			exactRequested: true,
			generatedAt: '2026-01-01T00:00:00.000Z',
		});

		expect(digest.analysis.tier).toBe('estimate');
		expect(digest.analysis.locMetric).toBe('whole-file');
		expect(digest.analysis.engine).toBeUndefined();
		expect(digest.catalog.publicMass).toEqual([]);
		expect(digest.catalog.icebergs).toEqual([]);
		expect(digest.scope?.exactRequested).toBe(true);
		expect(digest.scope?.exactApplied).toBe(false);
	});

	it('stamps Program when programMeta is present', () => {
		const digest = buildAgentPackDigest({
			graph,
			catalog,
			source: { kind: 'directory', path: 'demo:react-simple' },
			includeTests: true,
			programMeta: {
				resolvedCount: 3,
				resolvedAliasCount: 1,
				thinL3: true,
				exportSymbolCount: new Map([['src/god/hub.ts', 4]]),
				tsconfig: 'partial',
				missingLibs: [],
				rootFileCount: 2,
			},
			generatedAt: '2026-01-01T00:00:00.000Z',
		});

		const hub = digest.catalog.fileLoc.find((r) => r.path === 'src/god/hub.ts');
		expect(hub?.exportSymbolCount).toBe(4);
		// Envelope program stamps come from program input (not forced Exact)
		expect(digest.analysis.tier).toBe('estimate');
	});
});

describe('agentPackFilename', () => {
	it('sanitizes zip basename and demo labels', () => {
		expect(agentPackFilename('my-app.zip')).toBe('my-app-agent-digest.json');
		expect(agentPackFilename('demo:react-simple')).toBe(
			'demo-react-simple-agent-digest.json',
		);
		expect(agentPackFilename('browser-session')).toBe(
			'browser-session-agent-digest.json',
		);
	});
});

describe('programMetaToAgentInput', () => {
	it('returns undefined when meta absent', () => {
		expect(programMetaToAgentInput(undefined)).toBeUndefined();
	});

	it('maps SessionProgramMeta fields', () => {
		const input = programMetaToAgentInput({
			resolvedCount: 2,
			resolvedAliasCount: 0,
			thinL3: false,
			exportSymbolCount: new Map(),
			tsconfig: 'none',
			missingLibs: ['dom'],
			rootFileCount: 1,
		});
		expect(input).toEqual({
			applied: true,
			thinL3: false,
			exportSymbolCount: expect.any(Map),
			tsconfig: 'none',
			missingLibs: ['dom'],
			resolvedCount: 2,
			resolvedAliasCount: 0,
		});
	});
});
