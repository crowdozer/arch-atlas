import { describe, expect, it } from 'vitest';
import type { CodeGraph } from '@core/graph/types.ts';
import { encodeSession, parsePersistedSession } from './sessionStore.ts';

function minimalGraph(files: { path: string; content: string }[]): CodeGraph {
	const fileMap = new Map();
	const contents = new Map<string, string>();
	for (const f of files) {
		fileMap.set(f.path, {
			id: f.path,
			kind: 'file' as const,
			path: f.path,
			isSource: f.path.endsWith('.ts'),
			byteLength: f.content.length,
		});
		contents.set(f.path, f.content);
	}
	return {
		files: fileMap,
		packages: new Map(),
		edges: [],
		contents,
		packageJsonPaths: [],
		stats: {
			fileCount: files.length,
			sourceCount: files.filter((f) => f.path.endsWith('.ts')).length,
			edgeCount: 0,
			packageCount: 0,
			unresolvedCount: 0,
		},
	};
}

describe('sessionStore encode/parse', () => {
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
				deepest: [],
				views: [],
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
});
