import { describe, expect, it } from 'vitest';
import {
	mergePathAliases,
	parseAliasFlag,
	parseTsconfigPaths,
} from '@core/parse/tsconfig.ts';

describe('parseTsconfigPaths', () => {
	it('parses Next-like @/* paths with **/* include globs', () => {
		const text = `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["app/**/*.ts", "app/**/*.tsx"]
}`;
		const cfg = parseTsconfigPaths(text, '');
		expect(cfg).not.toBeNull();
		expect(cfg!.paths).toEqual([{ pattern: '@/*', targets: ['./*'] }]);
		expect(cfg!.baseUrl).toBe('.');
	});

	it('tolerates // comments and trailing commas', () => {
		const text = `{
  // path aliases for the app
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
    },
  },
  "include": ["src/**/*.ts"],
}`;
		const cfg = parseTsconfigPaths(text, 'project');
		expect(cfg).not.toBeNull();
		expect(cfg!.paths).toEqual([{ pattern: '@/*', targets: ['src/*'] }]);
		expect(cfg!.baseUrl).toBe('project');
	});

	it('does not corrupt "@/*" via false block-comment matches', () => {
		// Regression: unsafe /\/\*[\s\S]*?\*\// ate from "@/*" through "**/" in globs.
		const text = `{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/app/*": ["./src/app/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}`;
		const cfg = parseTsconfigPaths(text, '');
		expect(cfg).not.toBeNull();
		expect(cfg!.paths.map((p) => p.pattern).sort()).toEqual(['@/*', '@/app/*']);
	});
});

describe('mergePathAliases / parseAliasFlag', () => {
	it('parses PATTERN=TARGET and comma targets', () => {
		expect(parseAliasFlag('@/modules/artillery/*=./*')).toEqual({
			pattern: '@/modules/artillery/*',
			targets: ['./*'],
		});
		expect(parseAliasFlag('@/*=src/*,lib/*')).toEqual({
			pattern: '@/*',
			targets: ['src/*', 'lib/*'],
		});
		expect(parseAliasFlag('noseconds')).toBeNull();
	});

	it('rewrites win on same pattern', () => {
		const base = {
			baseUrl: '',
			paths: [{ pattern: '@/*', targets: ['src/*'] }],
		};
		const merged = mergePathAliases(base, [
			{ pattern: '@/*', targets: ['./*'] },
			{ pattern: '@/extra/*', targets: ['extra/*'] },
		]);
		expect(merged).not.toBeNull();
		const at = merged!.paths.find((p) => p.pattern === '@/*');
		expect(at?.targets).toEqual(['./*']);
		expect(merged!.paths.some((p) => p.pattern === '@/extra/*')).toBe(true);
	});
});
