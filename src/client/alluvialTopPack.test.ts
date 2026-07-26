import { describe, expect, it } from 'vitest';
import {
	centerHubFileSpine,
	isExportSideCategory,
	isHubFileSpine,
	recomputeLinkBreadths,
	topPackColumns,
} from './alluvialTopPack.ts';

type N = {
	name: string;
	category?: string;
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
	category?: string,
): N {
	return {
		name,
		category,
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

describe('centerHubFileSpine', () => {
	it('centers File with both in and out in the y-extent of side columns', () => {
		// Asymmetric hops: tall import stack left, short export right; File floated high
		const impA = node('a.ts', 0, 30, 40, 'Imports');
		const impB = node('b.ts', 0, 80, 120, 'Imports');
		const file = node('public.ts', 100, 30, 80, 'File');
		const expA = node('dep.ts', 200, 30, 50, 'Exports');

		const inL = { y0: 0, y1: 0, width: 40, source: impA, target: file };
		const inL2 = { y0: 0, y1: 0, width: 40, source: impB, target: file };
		const outL = { y0: 0, y1: 0, width: 50, source: file, target: expA };
		impA.sourceLinks.push(inL);
		impB.sourceLinks.push(inL2);
		file.targetLinks.push(inL, inL2);
		file.sourceLinks.push(outL);
		expA.targetLinks.push(outL);

		expect(isHubFileSpine(file)).toBe(true);
		expect(isHubFileSpine(impA)).toBe(false);

		const moved = centerHubFileSpine([impA, impB, file, expA]);
		expect(moved).toBeGreaterThan(0);

		// Others span 30..200; mid = 115; file h=80 → y0 = 75
		const mid = (30 + 200) / 2;
		expect(file.y0).toBeCloseTo(mid - 40, 5);
		expect(file.y1).toBeCloseTo(mid + 40, 5);
		// Side columns unchanged
		expect(impA.y0).toBe(30);
		expect(expA.y0).toBe(30);
	});

	it('no-op when File is source-only (reverse importers)', () => {
		const file = node('logger.ts', 0, 30, 100, 'File');
		const imp = node('a.ts', 100, 30, 50, 'Imports');
		const l = { y0: 0, y1: 0, width: 50, source: file, target: imp };
		file.sourceLinks.push(l);
		imp.targetLinks.push(l);
		expect(centerHubFileSpine([file, imp])).toBe(0);
		expect(file.y0).toBe(30);
	});
});

describe('isExportSideCategory', () => {
	it('matches Exports, legacy Exporters, and Export hop rings', () => {
		expect(isExportSideCategory('Exports')).toBe(true);
		expect(isExportSideCategory('Exporters')).toBe(true);
		expect(isExportSideCategory('Export hop 2')).toBe(true);
		expect(isExportSideCategory('Export hop 3')).toBe(true);
		expect(isExportSideCategory('Imports')).toBe(false);
		expect(isExportSideCategory('Import hop 2')).toBe(false);
		expect(isExportSideCategory('File')).toBe(false);
		expect(isExportSideCategory('Hop 1')).toBe(false);
	});
});

