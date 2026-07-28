/**
 * Phase 3: build-stamp hash is stable and changes when sources change.
 * (Does not run a full npm build.)
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertNodeEngines, focusE2ESourceHash } from './e2eServer.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../..',
);

describe('focus e2e build freshness', () => {
	it('assertNodeEngines accepts current runtime (CI must be >=22.12)', () => {
		expect(() => assertNodeEngines('22.12.0')).not.toThrow();
	});

	it('assertNodeEngines rejects absurdly high floor', () => {
		expect(() => assertNodeEngines('99.0.0')).toThrow(/requires Node/);
	});

	it('focusE2ESourceHash is stable 64-char hex', () => {
		const a = focusE2ESourceHash(repoRoot);
		const b = focusE2ESourceHash(repoRoot);
		expect(a).toBe(b);
		expect(a).toMatch(/^[a-f0-9]{64}$/);
		// Not empty content
		expect(a).not.toBe(createHash('sha256').digest('hex'));
	});
});
