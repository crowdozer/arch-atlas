import { describe, expect, it } from 'vitest';
import {
	compileOmitMatcher,
	expandOmitPattern,
	parseOmitFlagValues,
} from './omitGlobs.ts';

describe('expandOmitPattern', () => {
	it('expands bare segment to cover tree anywhere', () => {
		const e = expandOmitPattern('fixtures');
		expect(e).toContain('fixtures');
		expect(e).toContain('fixtures/**');
		expect(e).toContain('**/fixtures');
		expect(e).toContain('**/fixtures/**');
	});

	it('keeps explicit globs', () => {
		expect(expandOmitPattern('**/fixtures/**')).toEqual(['**/fixtures/**']);
	});
});

describe('compileOmitMatcher', () => {
	it('omits fixtures tree for bare name', () => {
		const omit = compileOmitMatcher(['fixtures']);
		expect(omit('fixtures/demo/a.ts')).toBe(true);
		expect(omit('fixtures')).toBe(true);
		expect(omit('src/core/index.ts')).toBe(false);
	});

	it('omits for **/fixtures style glob', () => {
		const omit = compileOmitMatcher(['**/fixtures']);
		expect(omit('fixtures/x.ts')).toBe(true);
		expect(omit('src/x.ts')).toBe(false);
	});

	it('supports multi-segment and test globs', () => {
		const omit = compileOmitMatcher(['**/dist/**', '**/*.test.ts']);
		expect(omit('packages/foo/dist/index.js')).toBe(true);
		expect(omit('src/core/view/fileHub.test.ts')).toBe(true);
		expect(omit('src/core/view/fileHub.ts')).toBe(false);
	});

	it('empty patterns match nothing', () => {
		const omit = compileOmitMatcher([]);
		expect(omit('fixtures/x.ts')).toBe(false);
	});
});

describe('parseOmitFlagValues', () => {
	it('splits commas and trims', () => {
		expect(parseOmitFlagValues(['fixtures', 'dist, **/node_modules'])).toEqual([
			'fixtures',
			'dist',
			'**/node_modules',
		]);
	});
});
