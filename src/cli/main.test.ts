/**
 * CLI smoke: import runCli against fixture, parse JSON.
 */
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

	afterEach(() => {
		logs.length = 0;
		errs.length = 0;
		vi.restoreAllMocks();
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
		]);
		expect(code).toBe(0);
		const out = logs.join('');
		const parsed = JSON.parse(out);
		expect(parsed.schema).toBe('arch-atlas.agent-digest.v1');
		expect(parsed.catalog).toBeDefined();
		expect(parsed.graph.edges.length).toBeGreaterThan(0);
		expect(parsed.summary.sourceCount).toBeGreaterThan(0);
		expect(JSON.stringify(parsed)).not.toContain('"contents"');
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

	it('tree command returns tree schema', async () => {
		capture();
		const code = await runCli(['tree', fixtureDir]);
		expect(code).toBe(0);
		const parsed = JSON.parse(logs.join(''));
		expect(parsed.schema).toBe('arch-atlas.agent-tree.v1');
		expect(parsed.tree.children?.length).toBeGreaterThan(0);
	});

	it('usage error without path exits 1', async () => {
		capture();
		const code = await runCli(['digest']);
		expect(code).toBe(1);
		expect(errs.join('').toLowerCase()).toMatch(/missing|usage|path/);
	});
});
