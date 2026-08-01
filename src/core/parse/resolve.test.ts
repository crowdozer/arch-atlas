import { describe, expect, it } from 'vitest';
import {
	resolveSpecifier,
	stripSpecifierResourceSuffix,
} from '@core/parse/resolve.ts';
import {
	RULES_BY_FAMILY,
	familyForPath,
	type PathRuleFamily,
} from '@core/parse/resolveRules.ts';
import type { PathAliasConfig } from '@core/parse/tsconfig.ts';

const emptyFiles = new Set<string>();

describe('resolveSpecifier path-like @/', () => {
	it('returns unresolved for @/… when aliases are null', () => {
		const r = resolveSpecifier('src/a.ts', '@/app/components/ui', emptyFiles, null);
		expect(r).toEqual({ kind: 'unresolved', specifier: '@/app/components/ui' });
	});

	it('still classifies real scoped packages as package', () => {
		const r = resolveSpecifier(
			'src/a.ts',
			'@radix-ui/react-dialog',
			emptyFiles,
			null,
		);
		expect(r).toEqual({
			kind: 'package',
			name: '@radix-ui/react-dialog',
			builtin: false,
		});
	});

	it('resolves @/ via alias when expand hits a file', () => {
		const alias: PathAliasConfig = {
			baseUrl: '.',
			paths: [{ pattern: '@/*', targets: ['./*'] }],
		};
		const files = new Set(['app/components/ui/index.ts']);
		const r = resolveSpecifier(
			'app/layout.tsx',
			'@/app/components/ui',
			files,
			alias,
		);
		expect(r).toEqual({ kind: 'file', path: 'app/components/ui/index.ts' });
	});
});

describe('resolveSpecifier relative', () => {
	it('resolves ./x to a sibling file', () => {
		const files = new Set(['src/a.ts', 'src/x.ts']);
		const r = resolveSpecifier('src/a.ts', './x', files, null);
		expect(r).toEqual({ kind: 'file', path: 'src/x.ts' });
	});

	it('resolves ../ sibling directory files', () => {
		const files = new Set(['src/lib/util.ts', 'src/app.ts']);
		const r = resolveSpecifier('src/lib/util.ts', '../app', files, null);
		expect(r).toEqual({ kind: 'file', path: 'src/app.ts' });
	});
});

describe('resolveSpecifier resource query strip', () => {
	it('strips ?worker before tryFile and hits the underlying file', () => {
		const files = new Set([
			'src/client/programWorkerClient.ts',
			'src/exact/program.worker.ts',
		]);
		const r = resolveSpecifier(
			'src/client/programWorkerClient.ts',
			'../exact/program.worker.ts?worker',
			files,
			null,
		);
		expect(r).toEqual({ kind: 'file', path: 'src/exact/program.worker.ts' });
	});

	it('strips ?raw / ?url and combined query', () => {
		const files = new Set(['src/a.ts', 'src/asset.txt']);
		expect(resolveSpecifier('src/a.ts', './asset.txt?raw', files, null)).toEqual({
			kind: 'file',
			path: 'src/asset.txt',
		});
		expect(resolveSpecifier('src/a.ts', './asset.txt?url', files, null)).toEqual({
			kind: 'file',
			path: 'src/asset.txt',
		});
		expect(
			resolveSpecifier('src/a.ts', './asset.txt?worker&inline', files, null),
		).toEqual({ kind: 'file', path: 'src/asset.txt' });
	});

	it('unresolved miss uses cleaned specifier (no ?worker paint noise)', () => {
		const r = resolveSpecifier(
			'src/client/x.ts',
			'../exact/missing.worker.ts?worker',
			emptyFiles,
			null,
		);
		expect(r).toEqual({
			kind: 'unresolved',
			specifier: '../exact/missing.worker.ts',
		});
	});

	it('leaves bare package names unchanged', () => {
		const r = resolveSpecifier('src/a.ts', 'zod', emptyFiles, null);
		expect(r).toEqual({ kind: 'package', name: 'zod', builtin: false });
	});

	it('stripSpecifierResourceSuffix cuts at first ? or #', () => {
		expect(stripSpecifierResourceSuffix('../x.ts?worker')).toBe('../x.ts');
		expect(stripSpecifierResourceSuffix('../x.ts#hash')).toBe('../x.ts');
		expect(stripSpecifierResourceSuffix('../x.ts?worker#frag')).toBe('../x.ts');
		expect(stripSpecifierResourceSuffix('zod')).toBe('zod');
	});
});

describe('resolveSpecifier tilde-prefix', () => {
	it('resolves ~/lib/x with baseUrl . when file present', () => {
		const alias: PathAliasConfig = { baseUrl: '.', paths: [] };
		const files = new Set(['lib/x.ts']);
		const r = resolveSpecifier('src/a.ts', '~/lib/x', files, alias);
		expect(r).toEqual({ kind: 'file', path: 'lib/x.ts' });
	});

	it('resolves ~/x with baseUrl src', () => {
		const alias: PathAliasConfig = { baseUrl: 'src', paths: [] };
		const files = new Set(['src/lib/x.ts']);
		const r = resolveSpecifier('src/a.ts', '~/lib/x', files, alias);
		expect(r).toEqual({ kind: 'file', path: 'src/lib/x.ts' });
	});

	it('resolves ~/ without alias (virtual root)', () => {
		const files = new Set(['lib/x.ts']);
		const r = resolveSpecifier('src/a.ts', '~/lib/x', files, null);
		expect(r).toEqual({ kind: 'file', path: 'lib/x.ts' });
	});

	it('returns unresolved for ~/missing - never package ~', () => {
		const r = resolveSpecifier('src/a.ts', '~/missing', emptyFiles, null);
		expect(r).toEqual({ kind: 'unresolved', specifier: '~/missing' });
		expect(r).not.toMatchObject({ kind: 'package' });
	});

	it('returns unresolved for bare ~ - never package ~', () => {
		const r = resolveSpecifier('src/a.ts', '~', emptyFiles, null);
		expect(r).toEqual({ kind: 'unresolved', specifier: '~' });
	});
});

describe('resolveSpecifier specifier-ext-rewrite', () => {
	it("resolves './foo.js' to foo.ts when only .ts exists", () => {
		const files = new Set(['src/foo.ts']);
		const r = resolveSpecifier('src/a.ts', './foo.js', files, null);
		expect(r).toEqual({ kind: 'file', path: 'src/foo.ts' });
	});

	it("resolves './foo.jsx' to foo.tsx", () => {
		const files = new Set(['src/foo.tsx']);
		const r = resolveSpecifier('src/a.ts', './foo.jsx', files, null);
		expect(r).toEqual({ kind: 'file', path: 'src/foo.tsx' });
	});

	it("resolves './foo.mjs' to foo.mts", () => {
		const files = new Set(['src/foo.mts']);
		const r = resolveSpecifier('src/a.ts', './foo.mjs', files, null);
		expect(r).toEqual({ kind: 'file', path: 'src/foo.mts' });
	});

	it('rewrites on alias candidates too', () => {
		const alias: PathAliasConfig = {
			baseUrl: '.',
			paths: [{ pattern: '@/*', targets: ['./*'] }],
		};
		const files = new Set(['lib/util.ts']);
		const r = resolveSpecifier('src/a.ts', '@/lib/util.js', files, alias);
		expect(r).toEqual({ kind: 'file', path: 'lib/util.ts' });
	});

	it('rewrites on tilde candidates', () => {
		const files = new Set(['lib/util.ts']);
		const r = resolveSpecifier('src/a.ts', '~/lib/util.js', files, null);
		expect(r).toEqual({ kind: 'file', path: 'lib/util.ts' });
	});

	it('does not invent missing rewrites', () => {
		const r = resolveSpecifier('src/a.ts', './gone.js', emptyFiles, null);
		expect(r).toEqual({ kind: 'unresolved', specifier: './gone.js' });
	});
});

describe('resolveSpecifier bare / builtins', () => {
	it('classifies lodash as package', () => {
		const r = resolveSpecifier('src/a.ts', 'lodash', emptyFiles, null);
		expect(r).toEqual({ kind: 'package', name: 'lodash', builtin: false });
	});

	it('classifies node:fs as builtin package', () => {
		const r = resolveSpecifier('src/a.ts', 'node:fs', emptyFiles, null);
		expect(r).toEqual({ kind: 'package', name: 'node:fs', builtin: true });
	});
});

describe('RULES_BY_FAMILY registry', () => {
	it('includes expected js-ts rule families', () => {
		const expected: PathRuleFamily[] = [
			'resource-query-strip',
			'dot-relative',
			'ext-index-probe',
			'config-path-alias',
			'pathlike-at-fail-closed',
			'tilde-prefix',
			'specifier-ext-rewrite',
			'bare-external',
		];
		for (const rule of expected) {
			expect(RULES_BY_FAMILY['js-ts']).toContain(rule);
		}
	});

	it('familyForPath maps JS/TS, Astro (→ js-ts), and Python sources', () => {
		expect(familyForPath('src/a.ts')).toBe('js-ts');
		expect(familyForPath('x.tsx')).toBe('js-ts');
		expect(familyForPath('x.mjs')).toBe('js-ts');
		// Astro SFCs resolve with js-ts path rules; parseKind stays astro-import
		expect(familyForPath('src/pages/index.astro')).toBe('js-ts');
		expect(familyForPath('x.py')).toBe('python');
		expect(familyForPath('pkg/a.py')).toBe('python');
		expect(familyForPath('x.go')).toBeNull();
	});

	it('includes python rule families without resource-query-strip', () => {
		expect(RULES_BY_FAMILY.python).toContain('dot-relative');
		expect(RULES_BY_FAMILY.python).toContain('ext-index-probe');
		expect(RULES_BY_FAMILY.python).toContain('bare-external');
		expect(RULES_BY_FAMILY.python).not.toContain('resource-query-strip');
	});
});

describe('resolveSpecifier python family', () => {
	it('resolves absolute dotted module to .py file', () => {
		const files = new Set(['pkg/a.py', 'pkg/b.py', 'pkg/__init__.py']);
		const r = resolveSpecifier('pkg/a.py', 'pkg.b', files, null);
		expect(r).toEqual({ kind: 'file', path: 'pkg/b.py' });
	});

	it('resolves package to __init__.py', () => {
		const files = new Set(['pkg/a.py', 'pkg/__init__.py']);
		const r = resolveSpecifier('main.py', 'pkg', files, null);
		expect(r).toEqual({ kind: 'file', path: 'pkg/__init__.py' });
	});

	it('resolves relative .sibling from package module', () => {
		const files = new Set(['pkg/a.py', 'pkg/b.py', 'pkg/__init__.py']);
		const r = resolveSpecifier('pkg/a.py', '.b', files, null);
		expect(r).toEqual({ kind: 'file', path: 'pkg/b.py' });
	});

	it('resolves relative ..other to parent package module', () => {
		const files = new Set([
			'pkg/sub/a.py',
			'pkg/sub/__init__.py',
			'pkg/other.py',
			'pkg/__init__.py',
		]);
		const r = resolveSpecifier('pkg/sub/a.py', '..other', files, null);
		expect(r).toEqual({ kind: 'file', path: 'pkg/other.py' });
	});

	it('maps unresolved bare import to package node', () => {
		const files = new Set(['pkg/a.py']);
		const r = resolveSpecifier('pkg/a.py', 'requests', files, null);
		expect(r).toEqual({ kind: 'package', name: 'requests', builtin: false });
	});

	it('maps unresolved dotted absolute to top-level package', () => {
		const files = new Set(['main.py']);
		const r = resolveSpecifier('main.py', 'urllib.request', files, null);
		expect(r).toEqual({ kind: 'package', name: 'urllib', builtin: false });
	});

	it('does not invent missing relative modules as packages', () => {
		const files = new Set(['pkg/a.py']);
		const r = resolveSpecifier('pkg/a.py', '.missing', files, null);
		expect(r).toEqual({ kind: 'unresolved', specifier: '.missing' });
	});
});
