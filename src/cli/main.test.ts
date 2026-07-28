/**
 * CLI smoke: import runCli against fixture, parse JSON.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './main.ts';

const fixtureDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../fixtures/demo-spaghetti-godfile',
);

const artilleryFixtureDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../fixtures/agent-artillery-shaped',
);

describe('runCli', () => {
	const logs: string[] = [];
	const errs: string[] = [];
	const tempDirs: string[] = [];

	afterEach(() => {
		logs.length = 0;
		errs.length = 0;
		vi.restoreAllMocks();
		for (const d of tempDirs.splice(0)) {
			try {
				rmSync(d, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
	});

	function capture() {
		vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
			logs.push(String(chunk));
			return true;
		});
		vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
			errs.push(String(chunk));
			return true;
		});
	}

	it('digest emits arch-atlas.agent-digest.v1 JSON', async () => {
		capture();
		const code = await runCli([
			'digest',
			fixtureDir,
			'--limit',
			'20',
			'--estimate', // keep estimate for speed/stability in unit test
		]);
		expect(code).toBe(0);
		const out = logs.join('');
		const parsed = JSON.parse(out);
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		expect(parsed.catalog).toBeDefined();
		expect(parsed.graph.edges.length).toBeGreaterThan(0);
		expect(parsed.summary.sourceCount).toBeGreaterThan(0);
		expect(parsed.scope).toBeDefined();
		expect(parsed.scope.exactRequested).toBe(false);
		expect(parsed.summary.externalPackageCount).toBe(parsed.summary.packageCount);
		expect(JSON.stringify(parsed)).not.toContain('"contents"');
	});

	it('digest default tries Exact (soft or applied)', async () => {
		capture();
		const code = await runCli(['digest', fixtureDir, '--limit', '5']);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		expect(parsed.scope?.exactRequested).toBe(true);
		// Applied if engine loads; else estimate with warning — either is exit 0
		if (parsed.analysis.tier === 'exact') {
			expect(parsed.scope.exactApplied).toBe(true);
			expect(parsed.analysis.locMetric).toBe('export-surface');
		} else {
			expect(parsed.analysis.tier).toBe('estimate');
			expect(
				parsed.warnings?.some((w: string) =>
					/Exact|export-surface|fallback/i.test(w),
				) || parsed.scope.exactApplied === false,
			).toBe(true);
		}
	});

	it('file report for hub', async () => {
		capture();
		const code = await runCli([
			'file',
			fixtureDir,
			'--file',
			'src/god/hub.ts',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-file.v1');
		expect(parsed.exists).toBe(true);
		expect(parsed.path).toBe('src/god/hub.ts');
	});

	it('tree command returns tree schema (summary default)', async () => {
		capture();
		const code = await runCli(['tree', fixtureDir]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-tree.v1');
		expect(parsed.mode).toBe('summary');
		expect(parsed.tree.children?.length).toBeGreaterThan(0);
	});

	it('tree without --exact does not warn about Exact', async () => {
		capture();
		const code = await runCli(['tree', fixtureDir]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(
			(parsed.warnings ?? []).some((w: string) => /--exact/i.test(w)),
		).toBe(false);
	});

	it('tree with --exact warns that Exact is digest-only', async () => {
		capture();
		const code = await runCli(['tree', fixtureDir, '--exact']);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(
			(parsed.warnings ?? []).some((w: string) =>
				/--exact applies to digest/i.test(w),
			),
		).toBe(true);
	});

	it('tree --tree-full sets mode full', async () => {
		capture();
		const code = await runCli(['tree', fixtureDir, '--tree-full']);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.mode).toBe('full');
	});

	it('mermaid emits flowchart with file SCC cycle honesty (artillery)', async () => {
		capture();
		const code = await runCli([
			'mermaid',
			artilleryFixtureDir,
			'--limit',
			'40',
		]);
		expect(code).toBe(0);
		const out = logs.join('');
		expect(out).toMatch(/flowchart LR/);
		expect(out).toMatch(/%% cycles\.runtime/);
		// Within-prefix runtime cycles must appear in comments
		const hasSimCycle =
			/physics\.ts/.test(out) && /weapons\.ts/.test(out);
		const hasConfigCycle =
			/config\.ts/.test(out) && /settingsStore\.ts/.test(out);
		expect(hasSimCycle || hasConfigCycle).toBe(true);
		// No raw source body dump
		expect(out).not.toMatch(/export function|export const physics/);
		// Plain text, not JSON envelope
		expect(() => JSON.parse(out)).toThrow();
	});

	it('mermaid --containment emits indexed hierarchy without dependency output', async () => {
		capture();
		const code = await runCli([
			'mermaid',
			fixtureDir,
			'--containment',
			'--limit',
			'3',
		]);
		expect(code).toBe(0);
		const out = logs.join('');
		expect(out).toMatch(/^flowchart TB/m);
		expect(out).toContain('mode=containment');
		expect(out).toContain('presentation=summary');
		expect(out).toMatch(/subgraph d\d+/);
		expect(out).not.toMatch(/-->|<-->|cycles\.runtime/);
		expect(() => JSON.parse(out)).toThrow();
	});

	it('mermaid --containment default summary shows multi-folder shape', async () => {
		// agent-artillery-shaped has client/, scripts/, types/ + root files —
		// summary must orient across folders, not alphabet-starve to one prefix.
		capture();
		const code = await runCli([
			'mermaid',
			artilleryFixtureDir,
			'--containment',
			'--limit',
			'40',
		]);
		expect(code).toBe(0);
		const out = logs.join('');
		expect(out).toMatch(/^flowchart TB/m);
		expect(out).toContain('presentation=summary');
		expect(out).toMatch(/subgraph d\d+\["client \(\d+ files\)"\]/);
		// At least one other top-level folder present
		const hasScripts = /subgraph d\d+\["scripts \(\d+ files\)"\]/.test(out);
		const hasTypes = /subgraph d\d+\["types \(\d+ files\)"\]/.test(out);
		expect(hasScripts || hasTypes).toBe(true);
		expect(out).not.toMatch(/-->|<-->|cycles\.runtime/);
	});

	it('mermaid --containment --tree-full stamps presentation=full', async () => {
		capture();
		const code = await runCli([
			'mermaid',
			fixtureDir,
			'--containment',
			'--tree-full',
			'--limit',
			'40',
		]);
		expect(code).toBe(0);
		const out = logs.join('');
		expect(out).toContain('presentation=full');
		expect(out).toMatch(/\bn\d+\["/);
		expect(out).not.toMatch(/-->|<-->|cycles\.runtime/);
	});

	it('usage error without path exits 1', async () => {
		capture();
		const code = await runCli(['digest']);
		expect(code).toBe(1);
		expect(errs.join('').toLowerCase()).toMatch(/missing|usage|path/);
	});

	it('digest --omit fixtures drops fixture paths from repo-root style tree', async () => {
		// Walk parent that contains this fixture under fixtures/… only when
		// invoked on a synthetic layout via fixtureDir's parent — use fixtureDir
		// itself with omit of src to prove flag wiring (path still indexes).
		capture();
		const code = await runCli([
			'digest',
			fixtureDir,
			'--omit',
			'src/god/**',
			'--limit',
			'10',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		const paths = (parsed.graph?.files ?? []).map((f: { path: string }) => f.path);
		expect(paths.some((p: string) => p.includes('god/hub'))).toBe(false);
		expect(parsed.warnings?.some((w: string) => w.includes('omitted'))).toBe(true);
	});

	it('digest --scope product stamps presets and drops test/debug paths', async () => {
		capture();
		const code = await runCli([
			'digest',
			artilleryFixtureDir,
			'--scope',
			'product',
			'--estimate',
			'--limit',
			'20',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		expect(parsed.scope?.presets).toEqual(['product']);
		expect(parsed.scope?.includeTests).toBe(false);
		const paths = (parsed.graph?.files ?? []).map((f: { path: string }) => f.path);
		expect(paths.some((p: string) => p.includes('__tests__'))).toBe(false);
		expect(paths.some((p: string) => p.startsWith('scripts/'))).toBe(false);
		// Product sources still present
		expect(paths).toContain('client/main.ts');
		expect(
			(parsed.warnings ?? []).some((w: string) => /scope product/i.test(w)),
		).toBe(true);
	});

	it('digest --alias stamps aliasRewrites and resolves path rewrite', async () => {
		capture();
		const code = await runCli([
			'digest',
			artilleryFixtureDir,
			'--alias',
			'@/modules/artillery/*=./*',
			'--estimate',
			'--limit',
			'20',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		expect(parsed.scope?.aliasRewrites).toEqual([
			{ pattern: '@/modules/artillery/*', targets: ['./*'] },
		]);
		// Alias import from main resolves to client/util.ts (toKind file)
		const utilEdge = (parsed.graph?.edges ?? []).find(
			(e: { from: string; to: string; toKind: string }) =>
				e.from === 'client/main.ts' && e.to === 'client/util.ts',
		);
		expect(utilEdge?.toKind).toBe('file');
		// Default full scope stamp when not product
		expect(parsed.scope?.presets).toEqual(['full']);
		expect(parsed.scope?.includeTests).toBe(true);
		// P2 envelope: rewrite-map + L2 when alias helps
		expect(parsed.analysis?.protocol).toBe('arch-atlas.analysis.v1');
		expect(parsed.analysis?.capabilities).toEqual(
			expect.arrayContaining(['L0', 'L1', 'L2']),
		);
		expect(parsed.analysis?.capabilityDetail?.aliases).toBe('rewrite-map');
	});

	it('digest --program stamps honestly (no L2 from zero resolves)', async () => {
		capture();
		const code = await runCli([
			'digest',
			artilleryFixtureDir,
			'--program',
			'--estimate',
			'--limit',
			'20',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		const programWarn = (parsed.warnings ?? []).some((w: string) =>
			/Program/i.test(w),
		);
		expect(programWarn).toBe(true);
		// Soft-fail path: may not load Program — then no program stamps
		const ig = parsed.analysis?.capabilityDetail?.importGraph;
		if (ig === 'program') {
			// L2 ok via existing tsconfig alias (not forced by zero program resolves)
			expect(parsed.analysis.capabilities).toEqual(
				expect.arrayContaining(['L0', 'L1', 'L2']),
			);
			// aliases:program only if Program re-resolved alias edges
			expect(['tsconfig', 'program', 'rewrite-map']).toContain(
				parsed.analysis.capabilityDetail.aliases,
			);
			// Artillery already resolved via tsconfig → 0 program patches → not aliases:program
			if (
				(parsed.warnings ?? []).some((w: string) =>
					/no edges re-resolved/i.test(w),
				)
			) {
				expect(parsed.analysis.capabilityDetail.aliases).not.toBe('program');
			}
			expect(parsed.analysis.honesty).toMatch(/not LSP/i);
			if (parsed.analysis.capabilities.includes('L3')) {
				const withCount = (parsed.catalog?.fileLoc ?? []).some(
					(r: { exportSymbolCount?: number }) =>
						typeof r.exportSymbolCount === 'number',
				);
				expect(withCount).toBe(true);
			}
			const utilEdge = (parsed.graph?.edges ?? []).find(
				(e: { from: string; to: string; toKind: string }) =>
					e.from === 'client/main.ts' && e.to === 'client/util.ts',
			);
			expect(utilEdge?.toKind).toBe('file');
		}
	});

	it('digest --artifact writes arch-atlas.artifact.v1 wrapper', async () => {
		capture();
		const dir = mkdtempSync(path.join(tmpdir(), 'atlas-artifact-'));
		tempDirs.push(dir);
		const artPath = path.join(dir, 'a.atlas.json');
		const outPath = path.join(dir, 'd.json');
		const code = await runCli([
			'digest',
			artilleryFixtureDir,
			'--estimate',
			'--limit',
			'10',
			'--out',
			outPath,
			'--artifact',
			artPath,
		]);
		expect(code).toBe(0);
		const digest = JSON.parse(readFileSync(outPath, 'utf8'));
		const art = JSON.parse(readFileSync(artPath, 'utf8'));
		expect(digest.schema).toBe('arch-atlas.agent-digest.v1');
		expect(digest.analysis?.protocol).toBe('arch-atlas.analysis.v1');
		expect(art.schema).toBe('arch-atlas.artifact.v1');
		expect(art.format).toBe('agent-digest');
		expect(art.payload?.schema).toBe('arch-atlas.agent-digest.v1');
		expect(art.payload?.analysis?.capabilities).toEqual(
			expect.arrayContaining(['L0', 'L1', 'L2']),
		);
	});

	it('digest rejects invalid --scope and --alias', async () => {
		capture();
		const badScope = await runCli([
			'digest',
			artilleryFixtureDir,
			'--scope',
			'debug',
			'--estimate',
		]);
		expect(badScope).toBe(1);
		expect(errs.join('').toLowerCase()).toMatch(/scope|full\|product/);

		logs.length = 0;
		errs.length = 0;
		const badAlias = await runCli([
			'digest',
			artilleryFixtureDir,
			'--alias',
			'noseconds',
			'--estimate',
		]);
		expect(badAlias).toBe(1);
		expect(errs.join('').toLowerCase()).toMatch(/alias|pattern/);
	});

	it('impact without --base/--head exits 1', async () => {
		capture();
		const code = await runCli(['impact', fixtureDir]);
		expect(code).toBe(1);
		expect(errs.join('').toLowerCase()).toMatch(/base|head/);
	});

	it('impact on non-git path exits 1', async () => {
		// Outside any worktree (fixtureDir is still inside this repo's .git).
		const bare = mkdtempSync(path.join(tmpdir(), 'arch-atlas-nongit-cli-'));
		tempDirs.push(bare);
		capture();
		const code = await runCli([
			'impact',
			bare,
			'--base',
			'HEAD',
			'--head',
			'HEAD',
		]);
		expect(code).toBe(1);
		expect(errs.join('').toLowerCase()).toMatch(/git|not a git|repository/);
	});

	it('impact HEAD vs HEAD on this repo emits agent-impact.v1', async () => {
		// Worktree is a real git checkout of arch-atlas.
		const repoRoot = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'../..',
		);
		capture();
		const code = await runCli([
			'impact',
			repoRoot,
			'--base',
			'HEAD',
			'--head',
			'HEAD',
			'--omit',
			'fixtures',
			'--limit',
			'10',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-impact.v1');
		expect(parsed.summary).toBeDefined();
		expect(parsed.edges.addedCount).toBe(0);
		expect(parsed.edges.removedCount).toBe(0);
		expect(JSON.stringify(parsed)).not.toContain('"contents"');
		expect(parsed.analysis.honesty).toMatch(/topology delta/i);
		// bare impact must not warn about Exact (default is estimate for non-digest)
		expect(
			(parsed.warnings ?? []).some((w: string) => /--exact/i.test(w)),
		).toBe(false);
	});

	it('impact ignores --exact with warning', async () => {
		const repoRoot = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'../..',
		);
		capture();
		const code = await runCli([
			'impact',
			repoRoot,
			'--base',
			'HEAD',
			'--head',
			'HEAD',
			'--exact',
			'--omit',
			'fixtures',
			'--limit',
			'5',
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-impact.v1');
		expect(
			parsed.warnings?.some((w: string) =>
				w.toLowerCase().includes('--exact ignored'),
			),
		).toBe(true);
	});
});
