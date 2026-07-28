import { describe, expect, it } from 'vitest';
import {
	allocateEqual,
	allocateProportional,
} from '@core/view/hubLinkUtils.ts';

describe('allocateProportional (fractional Phase 1B)', () => {
	it('gives every child a positive share when budget < fan-out', () => {
		const shares = allocateProportional(1, [
			{ key: 'b', raw: 1 },
			{ key: 'c', raw: 1 },
		]);
		expect(shares.size).toBe(2);
		expect(shares.get('b')).toBeCloseTo(0.5);
		expect(shares.get('c')).toBeCloseTo(0.5);
		expect((shares.get('b') ?? 0) + (shares.get('c') ?? 0)).toBeCloseTo(1);
	});

	it('preserves proportional ratios under unequal raw', () => {
		const shares = allocateProportional(3, [
			{ key: 'heavy', raw: 2 },
			{ key: 'light', raw: 1 },
		]);
		expect(shares.get('heavy')).toBeCloseTo(2);
		expect(shares.get('light')).toBeCloseTo(1);
	});

	it('is order-independent for equal raws', () => {
		const a = allocateProportional(1, [
			{ key: 'z', raw: 1 },
			{ key: 'a', raw: 1 },
			{ key: 'm', raw: 1 },
		]);
		const b = allocateProportional(1, [
			{ key: 'a', raw: 1 },
			{ key: 'm', raw: 1 },
			{ key: 'z', raw: 1 },
		]);
		expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
		for (const v of a.values()) expect(v).toBeCloseTo(1 / 3);
	});
});

describe('allocateEqual', () => {
	it('splits unit mass across three keys without zeros', () => {
		const shares = allocateEqual(1, ['c', 'a', 'b']);
		expect(shares.size).toBe(3);
		let sum = 0;
		for (const v of shares.values()) {
			expect(v).toBeGreaterThan(0);
			sum += v;
		}
		expect(sum).toBeCloseTo(1);
	});
});
