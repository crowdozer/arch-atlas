import { afterEach, describe, expect, it } from 'vitest';
import { indexFiles } from '@core/index.ts';
import {
	ensureExactForGraph,
	ensureExactLocalOnly,
	isLocalExactSource,
} from './ensureExact.ts';

describe('ensureExactForGraph', () => {
	afterEach(() => {
		const g = globalThis as typeof globalThis & {
			__ARCH_ATLAS_SURFACE__?: unknown;
		};
		delete g.__ARCH_ATLAS_SURFACE__;
	});

	it('uses global surface inject and skips loader', async () => {
		const { graph } = indexFiles([
			{ path: 'a.ts', content: 'export const a = 1;\n', byteLength: 20 },
		]);
		const injected = { targetSurfaceMass: () => 7 };
		(
			globalThis as typeof globalThis & {
				__ARCH_ATLAS_SURFACE__: typeof injected;
			}
		).__ARCH_ATLAS_SURFACE__ = injected;

		const r = await ensureExactForGraph(graph, {
			load: { skipLocal: true, skipCdn: true },
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source).toBe('inject');
			expect(r.provider.targetSurfaceMass(graph, {
				id: 'x',
				kind: 'imports',
				from: 'a.ts',
				to: 'a.ts',
				toKind: 'file',
				specifier: './a',
				epistemic: 'observed',
				form: 'import',
				line: 1,
				bindings: [],
			})).toBe(7);
		}
	});

	it('returns cached provider without reload', async () => {
		const { graph } = indexFiles([
			{ path: 'a.ts', content: 'export const a = 1;\n', byteLength: 20 },
		]);
		const cached = { targetSurfaceMass: () => 3 };
		const r = await ensureExactForGraph(graph, {
			cachedProvider: cached,
			allowGlobalSurfaceInject: false,
			load: { skipLocal: true, skipCdn: true },
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source).toBe('cached');
			expect(r.provider).toBe(cached);
		}
	});

	it('empty provider when graph has no JS/TS (gate can open)', async () => {
		const { graph } = indexFiles([
			{ path: 'main.go', content: 'package main\n', byteLength: 13 },
		]);
		const r = await ensureExactForGraph(graph, {
			allowGlobalSurfaceInject: false,
			load: { skipLocal: true, skipCdn: true },
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source).toBe('empty');
			expect(isLocalExactSource(r.source)).toBe(false);
			expect(r.engines.loadable).toEqual([]);
			expect(r.engines.missing.some((m) => m.language === 'Go')).toBe(true);
			expect(r.provider.targetSurfaceMass).toBeTypeOf('function');
		}
	});

	it('ensureExactLocalOnly succeeds with local classic and never needs CDN', async () => {
		const { graph } = indexFiles([
			{ path: 'a.ts', content: 'export const a = 1;\n', byteLength: 20 },
		]);
		const r = await ensureExactLocalOnly(graph, {
			allowGlobalSurfaceInject: false,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source).toBe('local');
			expect(isLocalExactSource(r.source)).toBe(true);
		}
	});

	it('ensureExactLocalOnly fails closed when local/inject unavailable', async () => {
		const { graph } = indexFiles([
			{ path: 'a.ts', content: 'export const a = 1;\n', byteLength: 20 },
		]);
		const r = await ensureExactLocalOnly(graph, {
			allowGlobalSurfaceInject: false,
			load: { skipLocal: true },
		});
		expect(r.ok).toBe(false);
	});

	it('fails closed when load fails for JS/TS graph', async () => {
		const { graph } = indexFiles([
			{ path: 'a.ts', content: 'export const a = 1;\n', byteLength: 20 },
		]);
		const r = await ensureExactForGraph(graph, {
			allowGlobalSurfaceInject: false,
			load: { skipLocal: true, skipCdn: true },
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(/not available/i);
			expect(r.engines.loadable).toEqual(['typescript']);
		}
	});

	it('loads local classic TS and builds provider for JS/TS graph', async () => {
		const { graph } = indexFiles([
			{
				path: 'a.ts',
				content: "import { used } from './b';\n",
				byteLength: 28,
			},
			{
				path: 'b.ts',
				content: 'export function used() { return 1; }\n',
				byteLength: 40,
			},
		]);
		const r = await ensureExactForGraph(graph, {
			allowGlobalSurfaceInject: false,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source === 'local' || r.source === 'jsdelivr' || r.source === 'unpkg').toBe(
				true,
			);
			const edge = graph.edges.find((e) => e.to === 'b.ts')!;
			const mass = r.provider.targetSurfaceMass(graph, edge);
			expect(mass).not.toBeNull();
			expect(mass!).toBeGreaterThanOrEqual(1);
		}
	});
});
