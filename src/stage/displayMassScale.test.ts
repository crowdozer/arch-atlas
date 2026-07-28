import { describe, expect, it } from 'vitest';
import type { AlluvialPayload } from '@core/graph/types.ts';
import {
	alluvialLinkKey,
	scaleAlluvialDisplayMass,
} from './displayMassScale.ts';

function fixturePayload(
	links: { source: string; target: string; value: number }[],
	pairs?: { parent: string; packageName: string; width: number }[],
): AlluvialPayload {
	return {
		data: links.map((l) => ({ ...l })),
		options: {
			title: 't',
			theme: 'g100',
			height: '360px',
			animations: false,
			toolbar: { enabled: false },
			legend: { enabled: false, clickable: false },
			accessibility: { svgAriaLabel: 't' },
			alluvial: {
				units: 'LOC',
				nodes: [],
				nodeAlignment: 'left',
			},
			color: { scale: {} },
			tooltip: { enabled: true },
		},
		meta: {
			focus: { kind: 'file', id: 'a.ts', label: 'a.ts' },
			nodeRef: {},
			nodeRank: {},
			...(pairs ? { externalStraightPairs: pairs.map((p) => ({ ...p })) } : {}),
		},
	};
}

describe('scaleAlluvialDisplayMass', () => {
	it('identity leaves values and pairs unchanged', () => {
		const payload = fixturePayload(
			[
				{ source: 'A', target: 'B', value: 100 },
				{ source: 'B', target: 'C', value: 1 },
			],
			[{ parent: 'B', packageName: 'pkg', width: 49 }],
		);
		const { layoutPayload, semanticByLinkKey, semanticByNodeName } =
			scaleAlluvialDisplayMass(payload, { mode: 'identity' });

		expect(layoutPayload.data.map((l) => l.value)).toEqual([100, 1]);
		expect(layoutPayload.meta.externalStraightPairs?.[0]?.width).toBe(49);
		expect(semanticByLinkKey.get(alluvialLinkKey('A', 'B'))).toBe(100);
		expect(semanticByNodeName.get('B')).toBe(100); // max(in=100, out=1)
	});

	it('sqrt is monotone and compresses extreme ratios', () => {
		const payload = fixturePayload([
			{ source: 'S', target: 'big', value: 50_000 },
			{ source: 'S', target: 'mid', value: 5_000 },
			{ source: 'S', target: 'tiny', value: 1 },
		]);
		const { layoutPayload, semanticByLinkKey } = scaleAlluvialDisplayMass(
			payload,
		);

		const [big, mid, tiny] = layoutPayload.data.map((l) => l.value);
		expect(big).toBeCloseTo(Math.sqrt(50_000));
		expect(mid).toBeCloseTo(Math.sqrt(5_000));
		expect(tiny).toBeCloseTo(1);

		// Rank preserved
		expect(big!).toBeGreaterThan(mid!);
		expect(mid!).toBeGreaterThan(tiny!);

		// Ratio compressed vs linear
		const layoutRatio = big! / mid!;
		const linearRatio = 50_000 / 5_000;
		expect(layoutRatio).toBeLessThan(linearRatio);
		expect(layoutRatio).toBeCloseTo(Math.sqrt(10));

		// Semantic maps hold originals
		expect(semanticByLinkKey.get(alluvialLinkKey('S', 'big'))).toBe(50_000);
	});

	it('log1p compresses further and stays positive', () => {
		const payload = fixturePayload([
			{ source: 'S', target: 'a', value: 50_000 },
			{ source: 'S', target: 'b', value: 5_000 },
		]);
		const { layoutPayload } = scaleAlluvialDisplayMass(payload, {
			mode: 'log1p',
		});
		const [a, b] = layoutPayload.data.map((l) => l.value);
		expect(a).toBeCloseTo(Math.log1p(50_000));
		expect(b).toBeCloseTo(Math.log1p(5_000));
		expect(a!).toBeGreaterThan(b!);
		expect(b!).toBeGreaterThan(0);
	});

	it('does not mutate the input payload', () => {
		const payload = fixturePayload(
			[{ source: 'A', target: 'B', value: 100 }],
			[{ parent: 'A', packageName: 'p', width: 100 }],
		);
		const dataRef = payload.data[0]!;
		const pairRef = payload.meta.externalStraightPairs![0]!;
		const optsRef = payload.options;

		scaleAlluvialDisplayMass(payload);

		expect(dataRef.value).toBe(100);
		expect(pairRef.width).toBe(100);
		expect(payload.data[0]).toBe(dataRef);
		expect(payload.meta.externalStraightPairs![0]).toBe(pairRef);
		// Options shared by reference on layout (functions stay live)
		const { layoutPayload } = scaleAlluvialDisplayMass(payload);
		expect(layoutPayload.options).toBe(optsRef);
	});

	it('scales externalStraightPairs widths lockstep with f', () => {
		const payload = fixturePayload(
			[{ source: 'File', target: 'pkg', value: 64 }],
			[{ parent: 'File', packageName: 'pkg', width: 64 }],
		);
		const { layoutPayload } = scaleAlluvialDisplayMass(payload, {
			mode: 'sqrt',
		});
		expect(layoutPayload.data[0]!.value).toBe(8);
		expect(layoutPayload.meta.externalStraightPairs![0]!.width).toBe(8);
	});

	it('aggregates duplicate source→target into semantic link key', () => {
		const payload = fixturePayload([
			{ source: 'A', target: 'B', value: 3 },
			{ source: 'A', target: 'B', value: 7 },
		]);
		const { semanticByLinkKey, semanticByNodeName } =
			scaleAlluvialDisplayMass(payload, { mode: 'identity' });
		expect(semanticByLinkKey.get(alluvialLinkKey('A', 'B'))).toBe(10);
		expect(semanticByNodeName.get('A')).toBe(10);
		expect(semanticByNodeName.get('B')).toBe(10);
	});

	it('node semantic mass uses max(inSum, outSum)', () => {
		// Kirchhoff interior: in=10, out=10 → 10
		// Free source: out=5, in=0 → 5
		// Sink: in=8, out=0 → 8
		const payload = fixturePayload([
			{ source: 'src', target: 'mid', value: 5 },
			{ source: 'other', target: 'mid', value: 5 },
			{ source: 'mid', target: 'sink', value: 8 },
			{ source: 'mid', target: 'otherSink', value: 2 },
		]);
		const { semanticByNodeName } = scaleAlluvialDisplayMass(payload, {
			mode: 'identity',
		});
		expect(semanticByNodeName.get('src')).toBe(5);
		expect(semanticByNodeName.get('mid')).toBe(10); // max(10 in, 10 out)
		expect(semanticByNodeName.get('sink')).toBe(8);
		expect(semanticByNodeName.get('otherSink')).toBe(2);
	});
});
