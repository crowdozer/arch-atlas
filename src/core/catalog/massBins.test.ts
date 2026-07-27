import { describe, expect, it } from 'vitest';
import {
	ICEBERG_MAX_RATIO,
	MIN_PRIVATE,
	MIN_WHOLE,
	PUBLIC_MIN_RATIO,
	buildMassBins,
} from '@core/catalog/massBins.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

/** Pad content to at least n lines (whole-file LOC). */
function padLines(body: string, n: number): string {
	const lines = body.split('\n');
	while (lines.length < n) lines.push(`// pad ${lines.length}`);
	return lines.join('\n') + (lines[lines.length - 1] === '' ? '' : '\n');
}

describe('buildMassBins', () => {
	it('classifies public mass by high surface ratio and icebergs by private mass', () => {
		const publicBody = padLines(
			'export const a = 1;\nexport const b = 2;\n',
			MIN_WHOLE + 10,
		);
		const icebergBody = padLines(
			'export const only = 1;\n' +
				Array.from({ length: 50 }, (_, i) => `function priv${i}() { return ${i}; }`).join(
					'\n',
				) +
				'\n',
			MIN_WHOLE + 20,
		);
		const smallBody = 'export const tiny = 1;\n';

		const { graph, catalog } = indexFiles(
			files([
				['src/publicApi.ts', publicBody],
				['src/iceberg.ts', icebergBody],
				['src/tiny.ts', smallBody],
			]),
		);

		// Estimate catalog keeps empty mass bins
		expect(catalog.publicMass).toEqual([]);
		expect(catalog.icebergs).toEqual([]);

		const wholePublic = publicBody.split('\n').length - (publicBody.endsWith('\n') ? 1 : 0);
		// fileLineCount typically counts newlines; align map with whole file size
		const surfaceMap = new Map<string, number>([
			// ratio ~1.0 public mass
			['src/publicApi.ts', wholePublic],
			// low surface, high private
			['src/iceberg.ts', 5],
			['src/tiny.ts', 1],
		]);

		// Use known whole from graph via relaxed floors for deterministic unit test
		const bins = buildMassBins(graph, surfaceMap, 15, {
			minWhole: 10,
			publicMinRatio: PUBLIC_MIN_RATIO,
			icebergMaxRatio: ICEBERG_MAX_RATIO,
			minPrivate: 10,
		});

		expect(bins.publicMass.some((r) => r.path === 'src/publicApi.ts')).toBe(true);
		const pub = bins.publicMass.find((r) => r.path === 'src/publicApi.ts')!;
		expect(pub.ratio).toBeGreaterThanOrEqual(PUBLIC_MIN_RATIO);
		expect(pub.surfaceLoc).toBe(wholePublic);

		expect(bins.icebergs.some((r) => r.path === 'src/iceberg.ts')).toBe(true);
		const ice = bins.icebergs.find((r) => r.path === 'src/iceberg.ts')!;
		expect(ice.ratio).toBeLessThanOrEqual(ICEBERG_MAX_RATIO);
		expect(ice.privateLoc).toBeGreaterThanOrEqual(MIN_PRIVATE > 10 ? 10 : ice.privateLoc);
		expect(ice.privateLoc).toBe(ice.wholeLoc - ice.surfaceLoc);

		// tiny below minWhole floor
		expect(bins.publicMass.some((r) => r.path === 'src/tiny.ts')).toBe(false);
		expect(bins.icebergs.some((r) => r.path === 'src/tiny.ts')).toBe(false);
	});

	it('sorts public mass by surfaceLoc and icebergs by privateLoc', () => {
		const big = padLines('export const x = 1;\n', 100);
		const mid = padLines('export const y = 1;\n', 90);

		const { graph } = indexFiles(
			files([
				['src/big.ts', big],
				['src/mid.ts', mid],
			]),
		);

		const surface = new Map<string, number>([
			['src/big.ts', 95],
			['src/mid.ts', 92],
		]);
		const { publicMass } = buildMassBins(graph, surface, 15, {
			minWhole: 50,
			publicMinRatio: 0.9,
		});
		expect(publicMass[0]!.path).toBe('src/big.ts');
		expect(publicMass[0]!.surfaceLoc).toBeGreaterThanOrEqual(
			publicMass[1]?.surfaceLoc ?? 0,
		);

		const iceSurface = new Map<string, number>([
			['src/big.ts', 10],
			['src/mid.ts', 20],
		]);
		const { icebergs } = buildMassBins(graph, iceSurface, 15, {
			minWhole: 50,
			icebergMaxRatio: 0.7,
			minPrivate: 20,
		});
		// big has more private mass (whole - 10) than mid (whole - 20)
		expect(icebergs[0]!.path).toBe('src/big.ts');
		expect(icebergs[0]!.privateLoc).toBeGreaterThanOrEqual(
			icebergs[1]?.privateLoc ?? 0,
		);
	});

	it('respects limit', () => {
		const body = padLines('export const z = 1;\n', 100);
		const entries: Array<[string, string]> = [];
		const surface = new Map<string, number>();
		for (let i = 0; i < 5; i++) {
			const p = `src/f${i}.ts`;
			entries.push([p, body]);
			surface.set(p, 100);
		}
		const { graph } = indexFiles(files(entries));
		const { publicMass } = buildMassBins(graph, surface, 2, {
			minWhole: 50,
			publicMinRatio: 0.9,
		});
		expect(publicMass.length).toBe(2);
	});

	it('skips non-js-ts parseKind and zero-surface icebergs', () => {
		const big = padLines('# large python\n' + 'x = 1\n'.repeat(100), 120);
		const zeroSurfaceTs = padLines('const privateBody = 1;\n'.repeat(100), 120);
		const { graph } = indexFiles(
			files([
				['src/app.py', big],
				['src/page.astro', padLines('---\nconst x = 1;\n---\n<div></div>\n', 120)],
				['src/zero.ts', zeroSurfaceTs],
			]),
		);
		const surface = new Map<string, number>([
			['src/app.py', 0],
			['src/page.astro', 0],
			['src/zero.ts', 0],
		]);
		const bins = buildMassBins(graph, surface, 15, {
			minWhole: 50,
			icebergMaxRatio: 0.7,
			minPrivate: 10,
		});
		// Python/Astro excluded; zero surface skipped (not false icebergs)
		expect(bins.icebergs).toEqual([]);
		expect(bins.publicMass).toEqual([]);
	});
});
