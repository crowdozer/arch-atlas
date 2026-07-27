import { describe, expect, it } from 'vitest';
import {
	inferFileRoles,
	isDebugPath,
	isPureBarrel,
} from '@core/catalog/roles.ts';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';

function files(entries: Array<[string, string]>): VirtualFile[] {
	return entries.map(([path, content]) => ({
		path,
		content,
		byteLength: content.length,
	}));
}

describe('roles', () => {
	it('detects debug and test paths', () => {
		expect(isDebugPath('scripts/seed.ts')).toBe(true);
		expect(isDebugPath('src/debug/probe.ts')).toBe(true);
		expect(isDebugPath('src/app.ts')).toBe(false);
		const { graph } = indexFiles(
			files([['src/foo.test.ts', 'export const t = 1;\n']]),
		);
		expect(inferFileRoles(graph, 'src/foo.test.ts')).toContain('test');
	});

	it('detects pure re-export barrels', () => {
		const { graph } = indexFiles(
			files([
				[
					'src/index.ts',
					`export { a } from './a';\nexport { b } from './b';\nexport { c } from './c';\n`,
				],
				['src/a.ts', 'export const a = 1;\n'],
				['src/b.ts', 'export const b = 2;\n'],
				['src/c.ts', 'export const c = 3;\n'],
			]),
		);
		expect(isPureBarrel(graph, 'src/index.ts')).toBe(true);
		expect(inferFileRoles(graph, 'src/index.ts')).toContain('barrel');
		expect(isPureBarrel(graph, 'src/a.ts')).toBe(false);
	});
});
