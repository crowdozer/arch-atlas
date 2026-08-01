import { describe, expect, it } from 'vitest';
import {
	familyFromLanguageTag,
	geometryForAxisKind,
	indication,
	languageChipStatus,
	lifecycle,
	statusColorCssVar,
} from './statusIndicator.ts';

describe('statusIndicator geometry (Sentinel re-home)', () => {
	it('indication stable = solid green triangle (PASS)', () => {
		expect(geometryForAxisKind('indication', 'stable')).toEqual({
			shape: 'triangle',
			variant: 'solid',
			color: 'green',
		});
	});

	it('indication cautious = hollow yellow diamond (WATCH - locked)', () => {
		expect(geometryForAxisKind('indication', 'cautious')).toEqual({
			shape: 'diamond',
			variant: 'outline',
			color: 'yellow',
		});
	});

	it('indication failed = solid red square', () => {
		expect(geometryForAxisKind('indication', 'failed')).toEqual({
			shape: 'square',
			variant: 'solid',
			color: 'red',
		});
	});

	it('indication informative = outline blue triangle', () => {
		expect(geometryForAxisKind('indication', 'informative')).toEqual({
			shape: 'triangle',
			variant: 'outline',
			color: 'blue',
		});
	});

	it('lifecycle stable = solid green circle (not PASS triangle)', () => {
		expect(geometryForAxisKind('lifecycle', 'stable')).toEqual({
			shape: 'circle',
			variant: 'solid',
			color: 'green',
		});
	});

	it('lifecycle incomplete = solid blue half-circle', () => {
		expect(geometryForAxisKind('lifecycle', 'incomplete')).toEqual({
			shape: 'circle-half',
			variant: 'solid',
			color: 'blue',
		});
	});

	it('lifecycle failed = circle-slash red', () => {
		expect(geometryForAxisKind('lifecycle', 'failed')).toEqual({
			shape: 'circle-slash',
			variant: 'solid',
			color: 'red',
		});
	});

	it('lifecycle cautious uses outline yellow circle (not WATCH diamond)', () => {
		expect(geometryForAxisKind('lifecycle', 'cautious')).toEqual({
			shape: 'circle',
			variant: 'outline',
			color: 'yellow',
		});
	});

	it('builders attach axis + geometry', () => {
		const p = indication('cautious', 'Watch', 'title');
		expect(p.axis).toBe('indication');
		expect(p.shape).toBe('diamond');
		expect(p.variant).toBe('outline');
		expect(p.color).toBe('yellow');
		expect(p.title).toBe('title');

		const l = lifecycle('incomplete', 'Loading');
		expect(l.axis).toBe('lifecycle');
		expect(l.shape).toBe('circle-half');
	});

	it('statusColorCssVar uses cds-status tokens (not brand teal)', () => {
		expect(statusColorCssVar('green')).toBe('var(--cds-status-green)');
		expect(statusColorCssVar('yellow')).toBe('var(--cds-status-yellow)');
	});
});

describe('languageChipStatus mapping', () => {
	it('maps TS/JS tags to js-ts family', () => {
		expect(familyFromLanguageTag('TypeScript')).toBe('js-ts');
		expect(familyFromLanguageTag('JavaScript')).toBe('js-ts');
	});

	it('Python / Astro → indication cautious (Estimate-only)', () => {
		const py = languageChipStatus('Python', { locPrecision: 'exact' });
		expect(py.axis).toBe('indication');
		expect(py.kind).toBe('cautious');
		expect(py.shape).toBe('diamond');
		expect(py.variant).toBe('outline');
		expect(py.color).toBe('yellow');
		expect(py.title).toMatch(/Estimate only/i);

		const astro = languageChipStatus('Astro', { locPrecision: 'program' });
		expect(astro.kind).toBe('cautious');
	});

	it('JS/TS · Estimate → informative hollow blue triangle', () => {
		const s = languageChipStatus('TypeScript', { locPrecision: 'estimate' });
		expect(s.axis).toBe('indication');
		expect(s.kind).toBe('informative');
		expect(s.shape).toBe('triangle');
		expect(s.variant).toBe('outline');
		expect(s.color).toBe('blue');
		expect(s.title).toMatch(/Exact available/i);
	});

	it('JS/TS · Exact → indication stable green triangle', () => {
		const s = languageChipStatus('JavaScript', { locPrecision: 'exact' });
		expect(s.axis).toBe('indication');
		expect(s.kind).toBe('stable');
		expect(s.shape).toBe('triangle');
		expect(s.variant).toBe('solid');
		expect(s.color).toBe('green');
		expect(s.title).toMatch(/export-surface/i);
		expect(s.title).not.toMatch(/LSP|tree-shake/i);
	});

	it('JS/TS · Program settled → lifecycle stable green circle', () => {
		const s = languageChipStatus('TypeScript', { locPrecision: 'program' });
		expect(s.axis).toBe('lifecycle');
		expect(s.kind).toBe('stable');
		expect(s.shape).toBe('circle');
		expect(s.color).toBe('green');
		expect(s.title).toMatch(/createProgram/i);
	});

	it('Program loading → lifecycle incomplete', () => {
		const s = languageChipStatus('TypeScript', {
			locPrecision: 'program',
			programLoading: true,
		});
		expect(s.axis).toBe('lifecycle');
		expect(s.kind).toBe('incomplete');
		expect(s.shape).toBe('circle-half');
	});

	it('Exact loading → lifecycle incomplete (no Exact mass claim)', () => {
		const s = languageChipStatus('TypeScript', {
			locPrecision: 'estimate',
			exactLoading: true,
		});
		expect(s.axis).toBe('lifecycle');
		expect(s.kind).toBe('incomplete');
		expect(s.shape).toBe('circle-half');
		expect(s.title).toMatch(/export-surface/i);
		expect(s.title).not.toMatch(/\bLSP\b|tree-shake/i);
	});

	it('Exact loading takes precedence over settled Exact chrome', () => {
		// Rehydrate mid-flight may still show locPrecision exact briefly
		const s = languageChipStatus('JavaScript', {
			locPrecision: 'exact',
			exactLoading: true,
		});
		expect(s.kind).toBe('incomplete');
		expect(s.label).toBe('Loading');
	});

	it('engineFailed → indication failed square', () => {
		const s = languageChipStatus('TypeScript', {
			locPrecision: 'estimate',
			engineFailed: true,
		});
		expect(s.kind).toBe('failed');
		expect(s.shape).toBe('square');
		expect(s.color).toBe('red');
	});

	it('other language → indication draft', () => {
		const s = languageChipStatus('Ruby', { locPrecision: 'estimate' });
		expect(s.kind).toBe('draft');
		expect(s.shape).toBe('circle');
		expect(s.variant).toBe('outline');
		expect(s.color).toBe('gray');
	});
});
