import { describe, expect, it } from 'vitest';
import { resolveSpecifier } from '@core/parse/resolve.ts';
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
