import { describe, expect, it } from 'vitest';
import ts from 'typescript-classic';
import { indexFiles } from '@core/index.ts';
import {
	collectExportSpansFromTs,
	createTsProgramProvider,
	isClassicTypescriptModule,
} from './tsProgramProvider.ts';

describe('isClassicTypescriptModule', () => {
	it('detects createSourceFile', () => {
		expect(isClassicTypescriptModule(ts)).toBe(true);
		expect(isClassicTypescriptModule({ version: '7' })).toBe(false);
	});
});

describe('collectExportSpansFromTs', () => {
	it('uses classic AST for named exports', () => {
		const content = [
			'export function used() {',
			'  return 1;',
			'}',
			'export const x = 2;',
		].join('\n');
		const spans = collectExportSpansFromTs(ts as never, 'b.ts', content);
		expect(spans).not.toBeNull();
		const names = spans!.map((s) => s.name).sort();
		expect(names).toContain('used');
		expect(names).toContain('x');
	});
});

describe('createTsProgramProvider (Program-backed)', () => {
	it('measures named export surface LOC via classic TS AST', () => {
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
		const provider = createTsProgramProvider({
			ts: ts as never,
			contents: graph.contents,
		});
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		expect(edge).toBeTruthy();
		const mass = provider.targetSurfaceMass(graph, edge!);
		expect(mass).not.toBeNull();
		expect(mass!).toBeLessThan(target.split('\n').length);
		expect(mass!).toBeGreaterThanOrEqual(1);
		expect(mass!).toBeLessThanOrEqual(5);

		const surf = provider.importedSurface?.(graph, edge!);
		expect(surf?.note).toBe('Exact · AST surface');
		expect(surf?.text).toMatch(/used/);
		// File line range (not excerpt-relative 1..n only)
		expect(surf?.startLine).toBeGreaterThanOrEqual(1);
		expect(surf?.endLine).toBeGreaterThanOrEqual(surf!.startLine!);
		// Should not include unused export body
		expect(surf?.text).not.toMatch(/unused/);
	});

	it('falls back to text surface when ts is missing', () => {
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
		expect(provider.targetSurfaceMass(graph, edge!)).not.toBeNull();
		const surf = provider.importedSurface?.(graph, edge!);
		expect(surf?.note).toBe('Exact · text surface');
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
		const provider = createTsProgramProvider({
			ts: ts as never,
			contents: graph.contents,
		});
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		expect(provider.targetSurfaceMass(graph, edge!)).toBe(1);
	});

	it('unresolved named binding returns null', () => {
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
		const provider = createTsProgramProvider({
			ts: ts as never,
			contents: graph.contents,
		});
		const edge = graph.edges.find((e) => e.to === 'b.ts');
		expect(provider.targetSurfaceMass(graph, edge!)).toBeNull();
	});
});
