import { describe, expect, it } from 'vitest';
import { catalogBoundaryCrossings } from '@core/catalog/boundary.ts';
import { indexFiles } from '@core/index.ts';
import type { VirtualFile } from '@core/graph/types.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('catalogBoundaryCrossings', () => {
	it('flags deep import past public façade', () => {
		const { graph } = indexFiles(
			files([
				[
					'sim/public.ts',
					`export { hit } from './core';\nexport { util } from './util';\n`,
				],
				['sim/core.ts', `export const hit = 1;\n`],
				['sim/util.ts', `export const util = 2;\n`],
				// Proper surface use
				['app/ok.ts', `import { hit } from '../sim/public';\n`],
				// Deep import past façade
				['app/deep.ts', `import { hit } from '../sim/core';\n`],
			]),
		);
		const crossings = catalogBoundaryCrossings(graph, 20);
		expect(
			crossings.some(
				(c) =>
					c.barrel === 'sim/public.ts' &&
					c.from === 'app/deep.ts' &&
					c.to === 'sim/core.ts',
			),
		).toBe(true);
		// Surface import should not appear as crossing
		expect(
			crossings.some((c) => c.from === 'app/ok.ts' && c.to === 'sim/public.ts'),
		).toBe(false);
	});
});
