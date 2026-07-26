import { describe, expect, it } from 'vitest';
import { recomputeLinkBreadths, topPackColumns } from './alluvialTopPack.ts';

type N = {
	name: string;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	sourceLinks: { y0: number; y1: number; width: number; source: N; target: N }[];
	targetLinks: { y0: number; y1: number; width: number; source: N; target: N }[];
};

function node(
	name: string,
	x0: number,
	y0: number,
	h: number,
): N {
	return {
		name,
		x0,
		x1: x0 + 10,
		y0,
		y1: y0 + h,
		sourceLinks: [],
		targetLinks: [],
	};
}

describe('topPackColumns', () => {
	it('shifts sparse left/mid columns up to match dense right top', () => {
		// Right column already near top; left/mid floated down (d3 free-space)
		const left = node('config.ts', 0, 80, 200);
		const midA = node('client/sim', 100, 60, 100);
		const midB = node('client/render', 100, 170, 80);
		const rightA = node('a.ts', 200, 30, 40);
		const rightB = node('b.ts', 200, 80, 40);
		const rightC = node('c.ts', 200, 130, 100);

		const linkLM = {
			y0: 0,
			y1: 0,
			width: 100,
			source: left,
			target: midA,
		};
		left.sourceLinks.push(linkLM);
		midA.targetLinks.push(linkLM);

		const nodes = [left, midA, midB, rightA, rightB, rightC];
		const moved = topPackColumns(nodes);
		expect(moved).toBeGreaterThan(0);

		// All columns share the same top
		const leftTop = left.y0;
		const midTop = Math.min(midA.y0, midB.y0);
		const rightTop = Math.min(rightA.y0, rightB.y0, rightC.y0);
		expect(leftTop).toBe(rightTop);
		expect(midTop).toBe(rightTop);
		expect(rightTop).toBe(30);

		// Relative spacing inside mid preserved
		expect(midB.y0 - midA.y0).toBe(110);
	});

	it('is a no-op when columns already share a top', () => {
		const a = node('a', 0, 30, 50);
		const b = node('b', 100, 30, 50);
		expect(topPackColumns([a, b])).toBe(0);
		expect(a.y0).toBe(30);
	});
});

describe('recomputeLinkBreadths', () => {
	it('places link midpoints along the node edge in order', () => {
		const src = node('s', 0, 10, 100);
		const t1 = node('t1', 100, 10, 40);
		const t2 = node('t2', 100, 60, 40);
		const l1 = { y0: 0, y1: 0, width: 40, source: src, target: t1 };
		const l2 = { y0: 0, y1: 0, width: 60, source: src, target: t2 };
		src.sourceLinks = [l1, l2];
		t1.targetLinks = [l1];
		t2.targetLinks = [l2];

		recomputeLinkBreadths([src, t1, t2]);
		expect(l1.y0).toBe(10 + 20); // mid of first 40-wide band on source
		expect(l2.y0).toBe(10 + 40 + 30); // mid of second 60-wide band on source
		expect(l1.y1).toBe(10 + 20); // mid on t1 (only target link)
		expect(l2.y1).toBe(60 + 30); // mid on t2
	});
});

