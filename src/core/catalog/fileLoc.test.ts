import { describe, expect, it } from 'vitest';
import { catalogFileLoc } from '@core/catalog/fileLoc.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogFileLoc', () => {
	it('ranks source files by whole-file LOC high to low', () => {
		const { graph, catalog } = indexFiles(
			files([
				['tsconfig.json', '{ "compilerOptions": {} }\n'],
				['src/small.ts', "export const a = 1;\n"],
				[
					'src/big.ts',
					[
						"import './mid';",
						'export const b = 1;',
						'export const c = 2;',
						'export const d = 3;',
						'export const e = 4;',
						'export const f = 5;',
						'export const g = 6;',
					].join('\n') + '\n',
				],
				['src/mid.ts', "export const m = 1;\nexport const n = 2;\n"],
			]),
		);

		const ranked = catalogFileLoc(graph);
		expect(ranked.length).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < ranked.length; i++) {
			expect(ranked[i - 1]!.loc).toBeGreaterThanOrEqual(ranked[i]!.loc);
		}
		expect(ranked[0]!.path).toBe('src/big.ts');
		expect(ranked[0]!.loc).toBeGreaterThan(ranked[1]!.loc);

		// Wired into map catalog
		expect(catalog.fileLoc.length).toBeGreaterThan(0);
		expect(catalog.fileLoc[0]!.path).toBe(ranked[0]!.path);
		expect(catalog.fileLoc[0]!.loc).toBe(ranked[0]!.loc);
	});

	it('skips non-source and empty content', () => {
		const { graph } = indexFiles(
			files([
				['readme.md', '# hi\n\nmore\n'],
				['src/a.ts', ''],
				['src/b.ts', "export const x = 1;\n"],
			]),
		);
		const ranked = catalogFileLoc(graph);
		expect(ranked.every((r) => r.path.endsWith('.ts'))).toBe(true);
		expect(ranked.find((r) => r.path === 'src/a.ts')).toBeUndefined();
		expect(ranked.some((r) => r.path === 'src/b.ts')).toBe(true);
	});
});
