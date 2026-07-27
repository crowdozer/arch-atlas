import { describe, expect, it } from 'vitest';
import { indexFiles } from '@core/index.ts';
import { createTsProgramProvider } from './tsProgramProvider.ts';

describe('createTsProgramProvider', () => {
	it('measures named export surface LOC (not whole file)', () => {
		const target = [
			'export function used() {',
			'  return 1;',
			'}',
			'',
			'export function unused() {',
			'  return 2;',
			'  // pad',
			'  // pad',
			'  // pad',
			'}',
			'',
			'const local = 3;',
		].join('\n');
		const { graph } = indexFiles([
			{
				path: 'a.ts',
				content: "import { used } from './b';\nused();\n",
				byteLength: 40,
			},
			{ path: 'b.ts', content: target + '\n', byteLength: target.length + 1 },
		]);
		const provider = createTsProgramProvider({ contents: graph.contents });
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		expect(edge).toBeTruthy();
		const mass = provider.targetSurfaceMass(graph, edge!);
		expect(mass).not.toBeNull();
		expect(mass!).toBeLessThan(target.split('\n').length);
		expect(mass!).toBeGreaterThanOrEqual(1);
		// used() spans ~3 lines
		expect(mass!).toBeLessThanOrEqual(5);
	});

	it('side-effect import returns mass 1', () => {
		const { graph } = indexFiles([
			{
				path: 'a.ts',
				content: "import './b';\n",
				byteLength: 14,
			},
			{
				path: 'b.ts',
				content: "console.log('side');\nexport const x = 1;\n",
				byteLength: 40,
			},
		]);
		const provider = createTsProgramProvider({ contents: graph.contents });
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		expect(provider.targetSurfaceMass(graph, edge!)).toBe(1);
	});

	it('unresolved named binding returns null (fail closed to whole-file)', () => {
		const { graph } = indexFiles([
			{
				path: 'a.ts',
				content: "import { missing } from './b';\n",
				byteLength: 32,
			},
			{
				path: 'b.ts',
				content: 'export const other = 1;\n',
				byteLength: 24,
			},
		]);
		const provider = createTsProgramProvider({ contents: graph.contents });
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		expect(provider.targetSurfaceMass(graph, edge!)).toBeNull();
	});

	it('importedSurface returns export snippet when bindings match', () => {
		const { graph } = indexFiles([
			{
				path: 'a.ts',
				content: "import { foo } from './b';\n",
				byteLength: 28,
			},
			{
				path: 'b.ts',
				content: 'export function foo() { return 1; }\n',
				byteLength: 36,
			},
		]);
		const provider = createTsProgramProvider({ contents: graph.contents });
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		const surf = provider.importedSurface?.(graph, edge!);
		expect(surf?.text).toMatch(/foo/);
	});
});
