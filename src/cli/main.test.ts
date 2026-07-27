/**
 * CLI smoke: import runCli against fixture, parse JSON.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './main.ts';

const fixtureDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../fixtures/demo-spaghetti-godfile',
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
