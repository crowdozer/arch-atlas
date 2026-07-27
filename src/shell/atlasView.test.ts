import { describe, expect, it } from 'vitest';
import { HUB_DEFAULT_MAX_DEPTH } from '@core/index.ts';
import {
	defaultDepthForView,
	nearestFileFocus,
	sameView,
	topOfStack,
	viewForFileOpen,
	viewUsesDepth,
	type AtlasView,
} from '@shell/atlasView.ts';

describe('sameView', () => {
	it('compares file-hub by fileId', () => {
		const a: AtlasView = { type: 'file-hub', fileId: 'src/a.ts' };
		const b: AtlasView = { type: 'file-hub', fileId: 'src/a.ts' };
		const c: AtlasView = { type: 'file-hub', fileId: 'src/b.ts' };
		expect(sameView(a, b)).toBe(true);
		expect(sameView(a, c)).toBe(false);
	});

	it('compares package by packageId', () => {
		const a: AtlasView = { type: 'package', packageId: 'react', label: 'react' };
		const b: AtlasView = { type: 'package', packageId: 'react', label: 'React' };
		const c: AtlasView = { type: 'package', packageId: 'vue', label: 'vue' };
		expect(sameView(a, b)).toBe(true);
		expect(sameView(a, c)).toBe(false);
	});

	it('compares module by moduleId', () => {
		const a: AtlasView = { type: 'module', moduleId: 'src' };
		const b: AtlasView = { type: 'module', moduleId: 'src' };
		const c: AtlasView = { type: 'module', moduleId: 'lib' };
		expect(sameView(a, b)).toBe(true);
		expect(sameView(a, c)).toBe(false);
	});

	it('rejects different types', () => {
		const file: AtlasView = { type: 'file-hub', fileId: 'x' };
		const pkg: AtlasView = { type: 'package', packageId: 'x', label: 'x' };
		expect(sameView(file, pkg)).toBe(false);
	});
});

describe('nearestFileFocus', () => {
	it('returns null on empty stack', () => {
		expect(nearestFileFocus([])).toBeNull();
	});

	it('returns top file-hub', () => {
		const stack: AtlasView[] = [{ type: 'file-hub', fileId: 'src/a.ts' }];
		expect(nearestFileFocus(stack)).toBe('src/a.ts');
	});

	it('walks under package/module drills to nearest file-hub', () => {
		const stack: AtlasView[] = [
			{ type: 'file-hub', fileId: 'src/a.ts' },
			{ type: 'package', packageId: 'react', label: 'react' },
			{ type: 'module', moduleId: 'src' },
		];
		expect(nearestFileFocus(stack)).toBe('src/a.ts');
	});

	it('prefers the nearest file-hub under the top', () => {
		const stack: AtlasView[] = [
			{ type: 'file-hub', fileId: 'src/old.ts' },
			{ type: 'file-hub', fileId: 'src/new.ts' },
			{ type: 'package', packageId: 'x', label: 'x' },
		];
		expect(nearestFileFocus(stack)).toBe('src/new.ts');
	});
});

describe('viewForFileOpen / depth helpers', () => {
	it('always opens file-hub', () => {
		expect(viewForFileOpen('src/a.ts')).toEqual({
			type: 'file-hub',
			fileId: 'src/a.ts',
		});
	});

	it('viewUsesDepth only for file-hub', () => {
		expect(viewUsesDepth({ type: 'file-hub', fileId: 'a' })).toBe(true);
		expect(viewUsesDepth({ type: 'package', packageId: 'p', label: 'p' })).toBe(
			false,
		);
		expect(viewUsesDepth({ type: 'module', moduleId: 'm' })).toBe(false);
		expect(viewUsesDepth(null)).toBe(false);
	});

	it('defaultDepthForView is hub default', () => {
		expect(defaultDepthForView({ type: 'file-hub', fileId: 'a' })).toBe(
			HUB_DEFAULT_MAX_DEPTH,
		);
	});

	it('topOfStack returns last frame', () => {
		expect(topOfStack([])).toBeNull();
		const stack: AtlasView[] = [
			{ type: 'file-hub', fileId: 'a' },
			{ type: 'package', packageId: 'p', label: 'p' },
		];
		expect(topOfStack(stack)).toEqual({
			type: 'package',
			packageId: 'p',
			label: 'p',
		});
	});
});
