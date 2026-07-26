import { describe, expect, it } from 'vitest';
import {
	centerHubFileSpine,
	isExportSideCategory,
	isFileCategory,
	isHubFileSpine,
	isImportRailLabel,
	recomputeLinkBreadths,
	rightTruncateLabel,
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

describe('rightTruncateLabel', () => {
	it('keeps short labels unchanged', () => {
		expect(rightTruncateLabel('src/a.ts', 36)).toBe('src/a.ts');
	});

	it('keeps the right end of long paths (basename side)', () => {
		const path = 'client/sim/very/deep/nested/module/public.ts';
		const out = rightTruncateLabel(path, 20);
		expect(out.startsWith('…')).toBe(true);
		expect(out.endsWith('public.ts')).toBe(true);
		expect(out.length).toBe(20);
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

describe('isFileCategory / isImportRailLabel', () => {
	it('identifies File category and import rails', () => {
		expect(isFileCategory('File')).toBe(true);
		expect(isFileCategory('Imports')).toBe(false);
		expect(isImportRailLabel('\u200b·in-rail·h2')).toBe(true);
		expect(isImportRailLabel('src/lib/x.ts')).toBe(false);
	});
});
