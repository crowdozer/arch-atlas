import { describe, expect, it } from 'vitest';
import { catalogStartsSplit } from '@core/catalog/starts.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogStartsSplit', () => {
	it('splits entrypoints vs roots and demotes scripts from entrypoints', () => {
		const { graph } = indexFiles(
			files([
				[
					'package.json',
					JSON.stringify({ name: 't', main: 'src/index.ts' }),
				],
				['src/index.ts', `import './leaf';\nexport const main = 1;\n`],
				['src/leaf.ts', `export const leaf = 1;\n`],
				['scripts/debug.ts', `import '../src/leaf';\n`],
				['src/orphan.ts', `import './leaf';\n`],
			]),
		);
		const { starts, entrypoints, roots } = catalogStartsSplit(graph, 40);
		expect(entrypoints.some((e) => e.path === 'src/index.ts')).toBe(true);
		expect(entrypoints.some((e) => e.path.includes('scripts/'))).toBe(false);
		expect(roots.some((r) => r.path === 'src/orphan.ts')).toBe(true);
		// starts = entrypoints then roots
		const firstRoot = starts.findIndex((s) => s.startKind === 'root');
		const lastEntry = starts.map((s) => s.startKind).lastIndexOf('entrypoint');
		if (firstRoot >= 0 && lastEntry >= 0) {
			expect(firstRoot).toBeGreaterThan(lastEntry);
		}
	});
});
