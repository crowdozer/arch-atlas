import { describe, expect, it } from 'vitest';
import {
	filterFilesByTestInclusion,
	isTestPath,
	shouldIgnorePath,
} from '@core/ignore.ts';

describe('isTestPath', () => {
	it('matches common test / mock path patterns', () => {
		expect(isTestPath('src/core/foo.test.ts')).toBe(true);
		expect(isTestPath('src/core/foo.spec.tsx')).toBe(true);
		expect(isTestPath('src/core/foo.e2e.test.ts')).toBe(true);
		expect(isTestPath('src/core/foo.e2e.ts')).toBe(true);
		expect(isTestPath('src/__tests__/foo.ts')).toBe(true);
		expect(isTestPath('src/__mocks__/bar.ts')).toBe(true);
		expect(isTestPath('src/core/foo.test.mts')).toBe(true);
	});

	it('does not treat product sources or bare test folders as tests', () => {
		expect(isTestPath('src/core/foo.ts')).toBe(false);
		expect(isTestPath('src/test/runner.ts')).toBe(false);
		expect(isTestPath('src/tests/harness.ts')).toBe(false);
		expect(isTestPath('package.json')).toBe(false);
	});
});

describe('filterFilesByTestInclusion', () => {
	const files = [
		{ path: 'src/a.ts' },
		{ path: 'src/a.test.ts' },
		{ path: 'src/__tests__/b.ts' },
	];

	it('is identity when includeTests is true (CLI-safe default)', () => {
		expect(filterFilesByTestInclusion(files, true)).toEqual(files);
	});

	it('drops test paths when includeTests is false', () => {
		expect(filterFilesByTestInclusion(files, false).map((f) => f.path)).toEqual([
			'src/a.ts',
		]);
	});
});

describe('shouldIgnorePath (unchanged baseline)', () => {
	it('still ignores node_modules', () => {
		expect(shouldIgnorePath('node_modules/x/index.js')).toBe(true);
	});
});
