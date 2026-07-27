import { describe, expect, it } from 'vitest';
import { EXACT_NOT_IMPLEMENTED_MESSAGE, HUB_DEFAULT_MAX_DEPTH } from '@core/index.ts';
import {
	canMountWeight,
	parseInteractionMode,
	parseLocPrecision,
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
});

describe('canMountWeight', () => {
	it('allows estimate + target-loc', () => {
		expect(canMountWeight('target-loc', 'estimate')).toEqual({ ok: true });
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
});
