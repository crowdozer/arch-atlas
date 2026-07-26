import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import {
	buildParseMap,
	classifyFileParse,
	shouldKeepInGraph,
} from '@core/parse/capability.ts';

describe('classifyFileParse', () => {
	it('marks JS/TS as import-parseable', () => {
		expect(classifyFileParse('src/a.ts').importParseable).toBe(true);
		expect(classifyFileParse('src/a.tsx').kind).toBe('js-ts-import');
		expect(classifyFileParse('lib/x.mjs').importParseable).toBe(true);
	});

	it('marks config and text as not import-parseable', () => {
		expect(classifyFileParse('package.json')).toMatchObject({
			importParseable: false,
			kind: 'config',
		});
		expect(classifyFileParse('tsconfig.json').kind).toBe('config');
		expect(classifyFileParse('README.md').kind).toBe('text');
		expect(classifyFileParse('styles.css').kind).toBe('text');
	});

	it('marks unsupported languages with a clear note', () => {
		const py = classifyFileParse('app/main.py');
		expect(py.importParseable).toBe(false);
		expect(py.kind).toBe('unsupported-language');
		expect(py.note).toMatch(/not supported/i);
	});
});

describe('shouldKeepInGraph', () => {
	it('keeps sources, config, text, and unsupported sources', () => {
		expect(shouldKeepInGraph('a.ts')).toBe(true);
		expect(shouldKeepInGraph('package.json')).toBe(true);
		expect(shouldKeepInGraph('README.md')).toBe(true);
		expect(shouldKeepInGraph('svc/main.py')).toBe(true);
	});
});

describe('buildGraph parseMap', () => {
	it('indexes parseMap for every kept file', () => {
		const graph = buildGraph([
			{ path: 'src/a.ts', content: 'export const a = 1\n', byteLength: 20 },
			{ path: 'README.md', content: '# hi\n', byteLength: 5 },
			{ path: 'app.py', content: 'print(1)\n', byteLength: 9 },
			{ path: 'package.json', content: '{}', byteLength: 2 },
		]);
		expect(graph.parseMap.size).toBe(graph.files.size);
		expect(graph.parseMap.get('src/a.ts')?.importParseable).toBe(true);
		expect(graph.parseMap.get('README.md')?.importParseable).toBe(false);
		expect(graph.parseMap.get('app.py')?.kind).toBe('unsupported-language');
		expect(graph.stats.parseableCount).toBe(1);
		expect(graph.stats.unparseableCount).toBe(3);
		expect(graph.files.get('README.md')?.parseNote).toBeTruthy();
	});

	it('buildParseMap matches file keys', () => {
		const map = buildParseMap(['a.ts', 'b.md']);
		expect(map.get('a.ts')?.importParseable).toBe(true);
		expect(map.get('b.md')?.importParseable).toBe(false);
	});
});
