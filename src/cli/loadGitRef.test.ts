/**
 * Thin host tests for git ref materialization.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	assertGitRepo,
	loadGitRef,
	resolveGitRef,
} from './loadGitRef.ts';

const repoRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);

const tempDirs: string[] = [];

afterEach(() => {
	for (const d of tempDirs.splice(0)) {
		try {
			rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
});

describe('loadGitRef', () => {
	it('assertGitRepo rejects non-repo directory', () => {
		// Must be outside any git worktree (fixtures live inside this repo).
		const bare = mkdtempSync(path.join(tmpdir(), 'arch-atlas-nongit-'));
		tempDirs.push(bare);
		expect(() => assertGitRepo(bare)).toThrow(/git/i);
	});

	it('resolveGitRef rejects bad ref', () => {
		expect(() =>
			resolveGitRef(repoRoot, 'definitely-not-a-real-ref-xyz'),
		).toThrow(/invalid git ref/i);
	});

	it('loadGitRef materializes HEAD into VirtualFile[]', () => {
		const feed = loadGitRef(repoRoot, {
			ref: 'HEAD',
			omit: ['fixtures'],
			maxDepth: 24,
		});
		expect(feed.ref).toBe('HEAD');
		expect(feed.resolvedRef).toMatch(/^[0-9a-f]{7,40}$/i);
		expect(feed.files.length).toBeGreaterThan(10);
		// omit fixtures
		expect(feed.files.some((f) => f.path.startsWith('fixtures/'))).toBe(
			false,
		);
		expect(
			feed.warnings.some((w) => w.includes('materialized git ref')),
		).toBe(true);
		// source text present in feed (host) but pure impact never re-emits it
		const pkg = feed.files.find((f) => f.path === 'package.json');
		expect(pkg?.content).toBeTruthy();
	});
});
