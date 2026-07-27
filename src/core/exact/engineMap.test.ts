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

	it('reports missing engines for unsupported languages, Python, and Astro', () => {
		const { graph } = indexFiles([
			{ path: 'src/a.ts', content: "export const a = 1;\n", byteLength: 20 },
			{ path: 'svc/main.go', content: 'package main\n', byteLength: 13 },
			{ path: 'ml/train.py', content: 'x = 1\n', byteLength: 6 },
			{
				path: 'src/pages/x.astro',
				content: '---\nconst n = 1;\n---\n<p />\n',
				byteLength: 30,
			},
		]);
		const r = requiredEngines(graph);
		expect(r.loadable).toEqual(['typescript']);
		const langs = r.missing.map((m) => m.language).sort();
		expect(langs).toEqual(['Astro', 'Go', 'Python']);
		const go = r.missing.find((m) => m.language === 'Go');
		expect(go?.engine).toBe('gopls');
		const py = r.missing.find((m) => m.language === 'Python');
		expect(py?.engine).toBe('python');
		const astro = r.missing.find((m) => m.language === 'Astro');
		expect(astro?.engine).toBe('astro-ls');
		// Python is import-parseable but must NOT force typescript alone
		expect(graph.files.get('ml/train.py')?.isSource).toBe(true);
		expect(graph.files.get('ml/train.py')?.parseKind).toBe('python-import');
		expect(graph.files.get('src/pages/x.astro')?.parseKind).toBe('astro-import');
	});

	it('does not require typescript for pure-Python graphs', () => {
		const { graph } = indexFiles([
			{ path: 'a.py', content: 'import b\n', byteLength: 9 },
			{ path: 'b.py', content: 'x = 1\n', byteLength: 6 },
		]);
		const r = requiredEngines(graph);
		expect(r.loadable).toEqual([]);
		expect(graphNeedsTypescript(graph)).toBe(false);
		expect(r.missing).toEqual([{ language: 'Python', engine: 'python' }]);
		expect(graph.stats.sourceCount).toBe(2);
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
