import { describe, expect, it } from 'vitest';
import {
	coveredExportLines,
	loadExactExportSurface,
} from './exactSurface.ts';
import type { ExportSpan } from '@exact/index.ts';
import { indexFiles, type VirtualFile } from '@core/index.ts';

describe('coveredExportLines', () => {
	it('unions overlapping spans', () => {
		const spans: ExportSpan[] = [
			{
				name: 'a',
				kind: 'named',
				startLine: 1,
				endLine: 3,
				text: '',
			},
			{
				name: 'b',
				kind: 'named',
				startLine: 3,
				endLine: 5,
				text: '',
			},
		];
		expect(coveredExportLines(spans)).toBe(5);
	});
});

describe('loadExactExportSurface', () => {
	it('loads local classic TS and ranks export-surface LOC', async () => {
		const files: VirtualFile[] = [
			{
				path: 'package.json',
				content: '{"name":"t","type":"module"}\n',
				byteLength: 32,
			},
			{
				path: 'src/big.ts',
				content: [
					'// padding noise',
					'const x = 1;',
					'const y = 2;',
					'export function onlyExport() {',
					'  return 1;',
					'}',
					'const z = 3;',
					'',
				].join('\n'),
				byteLength: 120,
			},
			{
				path: 'src/main.ts',
				content: `import { onlyExport } from './big.ts';\nonlyExport();\n`,
				byteLength: 50,
			},
		];
		const { graph } = indexFiles(files);
		const result = await loadExactExportSurface(graph, { localOnly: true });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.source).toBe('local');
		expect(result.classicAst).toBe(true);
		const surface = result.maps.exportSurfaceLoc.get('src/big.ts') ?? 0;
		const whole = result.maps.wholeFileLoc.get('src/big.ts') ?? 0;
		expect(whole).toBeGreaterThan(surface);
		expect(surface).toBeGreaterThan(0);
		expect(surface).toBeLessThan(whole);
	}, 30_000);
});
