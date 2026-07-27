import { describe, expect, it, vi } from 'vitest';
import {
	loadTypescript,
	typescriptCdnUrls,
} from './loadTypescript.ts';

const classicStub = {
	createSourceFile: () => ({}),
	ScriptTarget: { Latest: 99 },
};

describe('loadTypescript', () => {
	it('prefers explicit inject over network', async () => {
		const fetchImpl = vi.fn();
		const r = await loadTypescript({
			inject: classicStub,
			fetchImpl: fetchImpl as unknown as typeof fetch,
			skipLocal: true,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source).toBe('inject');
			expect(r.ts.createSourceFile).toBeTypeOf('function');
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('uses local classic typescript when available', async () => {
		const fetchImpl = vi.fn();
		const r = await loadTypescript({
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.source).toBe('local');
			expect(r.ts.createSourceFile).toBeTypeOf('function');
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('tries jsdelivr then unpkg when local skipped', async () => {
		const jsUrl = typescriptCdnUrls.jsdelivr('latest');
		const unUrl = typescriptCdnUrls.unpkg('latest');
		const fetchImpl = vi.fn(async (url: string) => {
			if (String(url) === jsUrl) {
				return {
					ok: false,
					status: 500,
					text: async () => '',
				};
			}
			if (String(url) === unUrl) {
				return {
					ok: true,
					status: 200,
					text: async () =>
						'var ts = { createSourceFile: function(){ return {}; } };',
				};
			}
			return { ok: false, status: 404, text: async () => '' };
		});
		const r = await loadTypescript({
			skipLocal: true,
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(fetchImpl).toHaveBeenCalled();
		const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
		expect(urls.some((u) => u.includes('jsdelivr'))).toBe(true);
		if (r.ok) {
			expect(r.source === 'unpkg' || r.source === 'jsdelivr').toBe(true);
		} else {
			expect(r.tried).toContain('jsdelivr');
		}
	});

	it('fails closed when all sources unavailable', async () => {
		const r = await loadTypescript({
			skipLocal: true,
			skipCdn: true,
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(/not available/i);
		}
	});
});
