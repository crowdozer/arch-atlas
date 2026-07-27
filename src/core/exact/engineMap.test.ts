import { describe, expect, it } from 'vitest';
import { indexFiles } from '@core/index.ts';
import {
	graphNeedsTypescript,
	requiredEngines,
} from '@core/exact/engineMap.ts';

describe('requiredEngines', () => {
	it('maps JS/TS sources to loadable typescript', () => {
		const { graph } = indexFiles([
			{ path: 'src/a.ts', content: "export const a = 1;\n", byteLength: 20 },
			{ path: 'src/b.js', content: "export const b = 2;\n", byteLength: 20 },
		]);
		const r = requiredEngines(graph);
		expect(r.loadable).toEqual(['typescript']);
		expect(r.missing).toEqual([]);
		expect(graphNeedsTypescript(graph)).toBe(true);
	});

	it('reports missing engines for unsupported languages', () => {
		const { graph } = indexFiles([
			{ path: 'src/a.ts', content: "export const a = 1;\n", byteLength: 20 },
			{ path: 'svc/main.go', content: 'package main\n', byteLength: 13 },
			{ path: 'ml/train.py', content: 'x = 1\n', byteLength: 6 },
		]);
		const r = requiredEngines(graph);
		expect(r.loadable).toEqual(['typescript']);
		const langs = r.missing.map((m) => m.language).sort();
		expect(langs).toEqual(['Go', 'Python']);
		const go = r.missing.find((m) => m.language === 'Go');
		expect(go?.engine).toBe('gopls');
	});

	it('ignores config and display text for engines', () => {
		const { graph } = indexFiles([
			{ path: 'package.json', content: '{"name":"x"}\n', byteLength: 14 },
			{ path: 'README.md', content: '# hi\n', byteLength: 5 },
			{ path: 'tsconfig.json', content: '{}\n', byteLength: 3 },
		]);
		const r = requiredEngines(graph);
		expect(r.loadable).toEqual([]);
		expect(r.missing).toEqual([]);
		expect(graphNeedsTypescript(graph)).toBe(false);
	});

	it('dedupes multiple files of the same missing language', () => {
		const { graph } = indexFiles([
			{ path: 'a.py', content: 'a=1\n', byteLength: 4 },
			{ path: 'b/c.py', content: 'b=2\n', byteLength: 4 },
		]);
		const r = requiredEngines(graph);
		expect(r.loadable).toEqual([]);
		expect(r.missing).toHaveLength(1);
		expect(r.missing[0]?.language).toBe('Python');
	});
});
