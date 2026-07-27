import { describe, expect, it } from 'vitest';
import { indexHostFeed } from '@core/hostPipe.ts';
import { indexFiles } from '@core/index.ts';

const tiny = [
	{
		path: 'a.ts',
		content: "import './b';\nexport const a = 1;\n",
		byteLength: 30,
	},
	{
		path: 'b.ts',
		content: 'export const b = 2;\n',
		byteLength: 20,
	},
];

describe('indexHostFeed', () => {
	it('matches indexFiles on the same VirtualFile[]', () => {
		const viaFiles = indexFiles(tiny);
		const viaFeed = indexHostFeed({ files: tiny });

		expect([...viaFeed.graph.files.keys()].sort()).toEqual(
			[...viaFiles.graph.files.keys()].sort(),
		);
		expect(viaFeed.graph.edges.map((e) => e.id).sort()).toEqual(
			viaFiles.graph.edges.map((e) => e.id).sort(),
		);
		expect(viaFeed.catalog.starts.map((s) => s.id)).toEqual(
			viaFiles.catalog.starts.map((s) => s.id),
		);
	});
});
