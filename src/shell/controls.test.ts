import { describe, expect, it } from 'vitest';
import { EXACT_NOT_IMPLEMENTED_MESSAGE, HUB_DEFAULT_MAX_DEPTH } from '@core/index.ts';
import {
	canMountWeight,
	isShakenWeightUi,
	parseInteractionMode,
	parseLocPrecision,
	parseSpineFormula,
	parseVizMaxDepth,
	parseWeightAxis,
} from '@shell/controls.ts';

describe('control parsers', () => {
	it('parseWeightAxis accepts known axes and defaults', () => {
		expect(parseWeightAxis('import-edges')).toBe('import-edges');
		expect(parseWeightAxis('importer-loc')).toBe('importer-loc');
		expect(parseWeightAxis('target-loc')).toBe('target-loc');
		expect(parseWeightAxis('nope')).toBe('target-loc');
	});

	it('parseLocPrecision defaults to estimate', () => {
		expect(parseLocPrecision('exact')).toBe('exact');
		expect(parseLocPrecision('estimate')).toBe('estimate');
		expect(parseLocPrecision('program')).toBe('program');
		expect(parseLocPrecision('')).toBe('estimate');
	});

	it('parseInteractionMode defaults to drill', () => {
		expect(parseInteractionMode('inspect')).toBe('inspect');
		expect(parseInteractionMode('drill')).toBe('drill');
		expect(parseInteractionMode('other')).toBe('drill');
	});

	it('parseVizMaxDepth clamps and defaults', () => {
		expect(parseVizMaxDepth('5')).toBe(5);
		expect(parseVizMaxDepth('0')).toBe(HUB_DEFAULT_MAX_DEPTH);
		expect(parseVizMaxDepth('abc')).toBe(HUB_DEFAULT_MAX_DEPTH);
		expect(parseVizMaxDepth('99')).toBe(32);
		expect(parseVizMaxDepth('3.9')).toBe(3);
	});

	it('parseSpineFormula accepts enum and falls back to default', () => {
		expect(parseSpineFormula('modules-then-in')).toBe('modules-then-in');
		expect(parseSpineFormula('fan-in')).toBe('fan-in');
		expect(parseSpineFormula('composite')).toBe('composite');
		expect(parseSpineFormula('share')).toBe('share');
		expect(parseSpineFormula('')).toBe('modules-then-in');
		expect(parseSpineFormula('config-boost')).toBe('modules-then-in');
	});
});

describe('canMountWeight', () => {
	it('allows estimate + target-loc', () => {
		expect(canMountWeight('target-loc', 'estimate')).toEqual({ ok: true });
	});

	it('allows program + target-loc without surface (topology; estimate mass)', () => {
		expect(canMountWeight('target-loc', 'program')).toEqual({ ok: true });
	});

	it('allows exact + import-edges (not imported-surface claim)', () => {
		expect(canMountWeight('import-edges', 'exact')).toEqual({ ok: true });
	});

	it('fails closed for exact + target-loc without surface provider', () => {
		const r = canMountWeight('target-loc', 'exact');
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.message).toBe(EXACT_NOT_IMPLEMENTED_MESSAGE);
		}
	});

	it('allows exact + target-loc when surface provider present', () => {
		const surface = { targetSurfaceMass: () => 4 };
		expect(canMountWeight('target-loc', 'exact', surface)).toEqual({ ok: true });
	});

	it('isShakenWeightUi recognizes UI-only shaken value', () => {
		expect(isShakenWeightUi('imported-loc')).toBe(true);
		expect(isShakenWeightUi('target-loc')).toBe(false);
	});
});
