import { describe, expect, it } from 'vitest';
import {
	compilerOptionsFromFeed,
	createFeedProgram,
	fromVirtualPath,
	isProgramTypescriptModule,
	normalizeFeedPath,
	resolveSpecifierWithProgram,
	toVirtualPath,
} from './programHost.ts';
import { loadTypescript } from './loadTypescript.ts';

async function loadClassic() {
	const loaded = await loadTypescript({ skipCdn: true });
	if (!loaded.ok) throw new Error(loaded.error);
	if (!isProgramTypescriptModule(loaded.ts)) {
		throw new Error('local typescript is not a Program-capable classic module');
	}
	return loaded.ts;
}

describe('programHost path helpers', () => {
	it('normalizes feed and virtual paths', () => {
		expect(normalizeFeedPath('/client/main.ts')).toBe('client/main.ts');
		expect(normalizeFeedPath('./a.ts')).toBe('a.ts');
		expect(toVirtualPath('client/main.ts')).toBe('/client/main.ts');
		expect(fromVirtualPath('/client/main.ts')).toBe('client/main.ts');
	});
});

describe('createFeedProgram', () => {
	it('builds program and resolves path-alias via tsconfig', async () => {
		const ts = await loadClassic();
		const files = new Map<string, string>([
			[
				'tsconfig.json',
				JSON.stringify({
					compilerOptions: {
						baseUrl: '.',
						paths: { '@/modules/artillery/*': ['./*'] },
						strict: true,
					},
					include: ['./**/*.ts'],
				}),
			],
			[
				'client/main.ts',
				`import { formatTick } from '@/modules/artillery/client/util';\nexport const x = formatTick(1);\n`,
			],
			[
				'client/util.ts',
				`export function formatTick(n: number): string { return String(n); }\n`,
			],
		]);

		const feed = createFeedProgram(files, ts);
		expect(feed.rootFiles).toContain('/client/main.ts');
		expect(feed.completeness.tsconfig).toBe('full');
		expect(feed.program.getSourceFile('/client/util.ts')).toBeTruthy();

		const hit = resolveSpecifierWithProgram(
			ts,
			feed,
			'client/main.ts',
			'@/modules/artillery/client/util',
		);
		expect(hit).toBe('client/util.ts');
	});

	it('resolves relative .js specifier to .ts in feed', async () => {
		const ts = await loadClassic();
		const files = new Map<string, string>([
			['a.ts', `import { b } from './b.js';\nexport const a = b;\n`],
			['b.ts', `export const b = 1;\n`],
		]);
		const feed = createFeedProgram(files, ts);
		const hit = resolveSpecifierWithProgram(ts, feed, 'a.ts', './b.js');
		expect(hit).toBe('b.ts');
	});

	it('compilerOptionsFromFeed stamps none without tsconfig', async () => {
		const ts = await loadClassic();
		const files = new Map([['a.ts', 'export const a = 1;\n']]);
		const { tsconfig } = compilerOptionsFromFeed(ts, files);
		expect(tsconfig).toBe('none');
	});
});
