import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogStartsSplit } from '@core/catalog/starts.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles, projectFileHub } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

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

describe('catalogStartsSplit', () => {
	it('splits entrypoints vs roots and demotes scripts from entrypoints', () => {
		const { graph } = indexFiles(
			files([
				[
					'package.json',
					JSON.stringify({ name: 't', main: 'src/index.ts' }),
				],
				['src/index.ts', `import './leaf';\nexport const main = 1;\n`],
				['src/leaf.ts', `export const leaf = 1;\n`],
				['scripts/debug.ts', `import '../src/leaf';\n`],
				['src/orphan.ts', `import './leaf';\n`],
			]),
		);
		const { starts, entrypoints, roots } = catalogStartsSplit(graph, 40);
		expect(entrypoints.some((e) => e.path === 'src/index.ts')).toBe(true);
		expect(entrypoints.some((e) => e.path.includes('scripts/'))).toBe(false);
		expect(roots.some((r) => r.path === 'src/orphan.ts')).toBe(true);
		// starts = entrypoints then roots
		const firstRoot = starts.findIndex((s) => s.startKind === 'root');
		const lastEntry = starts.map((s) => s.startKind).lastIndexOf('entrypoint');
		if (firstRoot >= 0 && lastEntry >= 0) {
			expect(firstRoot).toBeGreaterThan(lastEntry);
		}
	});

	it('does not treat Python under app/ as framework entrypoint by path alone', () => {
		const { graph } = indexFiles(
			files([
				['app/__init__.py', ''],
				['app/api/routes.py', 'from app.lib import x\n'],
				['app/lib/__init__.py', ''],
				['app/lib/x.py', 'x = 1\n'],
			]),
		);
		const { entrypoints, starts } = catalogStartsSplit(graph, 40);
		expect(entrypoints.some((e) => e.path === 'app/__init__.py')).toBe(false);
		expect(entrypoints.some((e) => e.path === 'app/api/routes.py')).toBe(false);
		// Should not rank zero-degree package init as default when other sources exist
		expect(starts[0]?.path).not.toBe('app/__init__.py');
	});

	it('still treats JS app/page.tsx as framework-ish entrypoint', () => {
		const { graph } = indexFiles(
			files([
				['app/page.tsx', `import '../lib/x';\nexport default function Page() {}\n`],
				['app/layout.tsx', `export default function Layout({ children }: { children: React.ReactNode }) { return children; }\n`],
				['lib/x.ts', `export const x = 1;\n`],
			]),
		);
		const { entrypoints } = catalogStartsSplit(graph, 40);
		expect(entrypoints.some((e) => e.path === 'app/page.tsx')).toBe(true);
		expect(entrypoints.some((e) => e.path === 'app/layout.tsx')).toBe(true);
	});

	it('ranks Python common entry names (app/main.py)', () => {
		const { graph } = indexFiles(
			files([
				['app/main.py', 'from app.lib import x\n'],
				['app/lib/x.py', 'x = 1\n'],
				['app/__init__.py', ''],
			]),
		);
		const { entrypoints, starts } = catalogStartsSplit(graph, 40);
		expect(entrypoints.some((e) => e.path === 'app/main.py')).toBe(true);
		expect(starts[0]?.path).toBe('app/main.py');
	});

	it('fallback prefers sources with edges over zero-degree files', () => {
		// No package.json / common entries / framework routes → pure fallback
		const { graph } = indexFiles(
			files([
				['pkg/__init__.py', ''],
				['pkg/util.py', 'from pkg.leaf import y\n'],
				['pkg/leaf.py', 'y = 1\n'],
			]),
		);
		const { starts } = catalogStartsSplit(graph, 40);
		// If roots exist they win; either way default must not be zero-degree init first
		const top = starts[0];
		expect(top).toBeDefined();
		expect(top!.path).not.toBe('pkg/__init__.py');
		const degree = (top!.inDegree ?? 0) + (top!.outDegree ?? 0);
		expect(degree).toBeGreaterThan(0);
	});

	it('demo-python-app default start has non-null file hub', () => {
		const vfs = walkFiles(path.join(fixturesRoot, 'demo-python-app'));
		const { graph, catalog } = indexFiles(vfs);
		const first = catalog.starts[0];
		expect(first).toBeDefined();
		expect(first!.path).not.toBe('app/__init__.py');
		const hub = projectFileHub(graph, first!.id);
		expect(hub).not.toBeNull();
	});
});
