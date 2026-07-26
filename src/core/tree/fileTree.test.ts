import { describe, expect, it } from 'vitest';
import {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
} from '@core/tree/fileTree.ts';

describe('buildFileTree', () => {
	it('nests folders and keeps dirs before files', () => {
		const root = buildFileTree([
			'app/page.tsx',
			'app/layout.tsx',
			'app/components/ui/index.tsx',
			'lib/utils.ts',
			'package.json',
		]);
		expect(root.children.map((c) => c.name)).toEqual(['app', 'lib', 'package.json']);
		const app = root.children.find((c) => c.name === 'app')!;
		expect(app.kind).toBe('dir');
		expect(app.children.map((c) => c.name)).toEqual([
			'components',
			'layout.tsx',
			'page.tsx',
		]);
		const ui = app.children
			.find((c) => c.name === 'components')!
			.children.find((c) => c.name === 'ui')!;
		expect(ui.children[0]?.path).toBe('app/components/ui/index.tsx');
	});

	it('marks unparseable files and folders from importParseable set', () => {
		const parseable = new Set(['src/a.ts']);
		const notes = new Map([
			['src/a.ts', 'Import-parsed'],
			['docs/README.md', 'Text asset'],
			['scripts/run.py', 'Language not supported'],
		]);
		const root = buildFileTree(
			['src/a.ts', 'docs/README.md', 'scripts/run.py'],
			{ importParseable: parseable, parseNotes: notes },
		);
		const src = root.children.find((c) => c.name === 'src')!;
		const docs = root.children.find((c) => c.name === 'docs')!;
		const scripts = root.children.find((c) => c.name === 'scripts')!;
		expect(src.unparseable).toBe(false);
		expect(src.isSource).toBe(true);
		expect(docs.unparseable).toBe(true);
		expect(scripts.unparseable).toBe(true);

		const a = src.children[0]!;
		expect(a.isSource).toBe(true);
		expect(a.unparseable).toBe(false);
		expect(a.parseNote).toBe('Import-parsed');

		const md = docs.children[0]!;
		expect(md.isSource).toBe(false);
		expect(md.unparseable).toBe(true);
		expect(md.parseNote).toMatch(/Text/);
	});

	it('expandPathsForFilter opens ancestors of matches', () => {
		const open = expandPathsForFilter(
			['app/components/ui/index.tsx', 'lib/utils.ts'],
			'index',
		);
		expect(open.has('app')).toBe(true);
		expect(open.has('app/components')).toBe(true);
		expect(open.has('app/components/ui')).toBe(true);
		expect(open.has('lib')).toBe(false);
	});

	it('nodeMatchesFilter walks descendants', () => {
		const root = buildFileTree(['src/a/b.ts', 'other/x.ts']);
		const src = root.children.find((c) => c.name === 'src')!;
		expect(nodeMatchesFilter(src, 'b.ts')).toBe(true);
		expect(nodeMatchesFilter(src, 'zzz')).toBe(false);
	});
});
