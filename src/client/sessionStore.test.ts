import { describe, expect, it } from 'vitest';
import type { CodeGraph } from '@core/graph/types.ts';
import { encodeSession, parsePersistedSession } from './sessionStore.ts';

function minimalGraph(files: { path: string; content: string }[]): CodeGraph {
	const fileMap = new Map();
	const contents = new Map<string, string>();
	const parseMap = new Map();
	for (const f of files) {
		const isSource = f.path.endsWith('.ts');
		fileMap.set(f.path, {
			id: f.path,
			kind: 'file' as const,
			path: f.path,
			isSource,
			parseKind: isSource ? ('js-ts-import' as const) : ('text' as const),
			parseNote: isSource ? 'Import-parsed' : 'Text',
			byteLength: f.content.length,
		});
		contents.set(f.path, f.content);
		parseMap.set(f.path, {
			path: f.path,
			importParseable: isSource,
			kind: isSource ? 'js-ts-import' : 'text',
			note: isSource ? 'Import-parsed' : 'Text',
		});
	}
	const sourceCount = files.filter((f) => f.path.endsWith('.ts')).length;
	return {
		files: fileMap,
		packages: new Map(),
		edges: [],
		contents,
		packageJsonPaths: [],
		parseMap,
		stats: {
			fileCount: files.length,
			sourceCount,
			parseableCount: sourceCount,
			unparseableCount: files.length - sourceCount,
			edgeCount: 0,
			packageCount: 0,
			unresolvedCount: 0,
		},
	};
}

describe('sessionStore encode/parse', () => {
	it('prefers full feed files over graph.contents when provided', () => {
		// Graph may exclude tests; full feed must still persist for re-include
		const graph = minimalGraph([{ path: 'src/a.ts', content: 'export const a = 1' }]);
		const encoded = encodeSession({
			graph,
			catalog: {
				starts: [],
				ends: [],
				hotspots: [],
				complex: [],
				deepest: [],
				fileLoc: [],
				blastRadius: [],
				publicMass: [],
				icebergs: [],
				spines: [],
				summary: {
					sourceCount: 1,
					packageCount: 0,
					edgeCount: 0,
					unresolvedCount: 0,
					languages: ['TypeScript'],
				},
			},
			startId: 'src/a.ts',
			warnings: [],
			expanded: new Set(['src']),
			files: [
				{ path: 'src/a.ts', content: 'export const a = 1', byteLength: 18 },
				{
					path: 'src/a.test.ts',
					content: 'import { a } from "./a"',
					byteLength: 24,
				},
			],
		});
		expect(encoded.files.map((f) => f.path).sort()).toEqual([
			'src/a.test.ts',
			'src/a.ts',
		]);
	});

	it('round-trips files and UI state', () => {
		const graph = minimalGraph([
			{ path: 'src/a.ts', content: 'export const a = 1' },
			{ path: 'src/b.ts', content: 'import { a } from "./a"' },
		]);
		const encoded = encodeSession({
			graph,
			catalog: {
				starts: [],
				ends: [],
				hotspots: [],
				complex: [],
				deepest: [],
				fileLoc: [],
				blastRadius: [],
				publicMass: [],
				icebergs: [],
				spines: [],
				summary: {
					sourceCount: 2,
					packageCount: 0,
					edgeCount: 0,
					unresolvedCount: 0,
					languages: ['TypeScript'],
				},
			},
			startId: 'src/a.ts',
			warnings: ['note'],
			expanded: new Set(['src']),
		});
		expect(encoded.v).toBe(1);
		expect(encoded.files).toHaveLength(2);
		expect(encoded.startId).toBe('src/a.ts');
		expect(encoded.expanded).toEqual(['src']);

		const parsed = parsePersistedSession(JSON.stringify(encoded));
		expect(parsed).not.toBeNull();
		expect(parsed!.files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
		expect(parsed!.startId).toBe('src/a.ts');
		expect(parsed!.warnings).toEqual(['note']);
	});

	it('rejects garbage JSON', () => {
		expect(parsePersistedSession('{"v":2}')).toBeNull();
		expect(parsePersistedSession('not-json')).toBeNull();
		expect(parsePersistedSession('{"v":1,"files":[]}')).toBeNull();
	});

	it('round-trips locPrecision for boot restore', () => {
		const graph = minimalGraph([
			{ path: 'src/a.ts', content: 'export const a = 1' },
		]);
		const encoded = encodeSession({
			graph,
			catalog: {
				starts: [],
				ends: [],
				hotspots: [],
				complex: [],
				deepest: [],
				fileLoc: [],
				blastRadius: [],
				publicMass: [],
				icebergs: [],
				spines: [],
				summary: {
					sourceCount: 1,
					packageCount: 0,
					edgeCount: 0,
					unresolvedCount: 0,
					languages: ['TypeScript'],
				},
			},
			startId: 'src/a.ts',
			warnings: [],
			expanded: new Set(['src']),
			locPrecision: 'program',
		});
		expect(encoded.locPrecision).toBe('program');
		const parsed = parsePersistedSession(JSON.stringify(encoded));
		expect(parsed?.locPrecision).toBe('program');
	});

	it('older blobs without locPrecision still parse', () => {
		const raw = JSON.stringify({
			v: 1,
			files: [{ path: 'a.ts', content: 'export {}', byteLength: 10 }],
			startId: 'a.ts',
			expanded: [],
			warnings: [],
			savedAt: 1,
		});
		const parsed = parsePersistedSession(raw);
		expect(parsed).not.toBeNull();
		expect(parsed!.locPrecision).toBeUndefined();
	});
});
