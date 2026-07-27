/**
 * Directory vs ZIP feed parity (same ignore + text-extension rules).
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadDirectory, loadFeed, loadZip, DEFAULT_MAX_DEPTH } from './loadFeed.ts';

const fixtureDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../fixtures/demo-spaghetti-godfile',
);

function pathsOf(files: { path: string }[]): Set<string> {
	return new Set(files.map((f) => f.path));
}

describe('loadDirectory', () => {
	it('loads spaghetti fixture text sources and skips nothing critical', () => {
		const { files, source, warnings } = loadDirectory(fixtureDir);
		expect(source.kind).toBe('directory');
		expect(files.length).toBeGreaterThan(15);
		const paths = pathsOf(files);
		expect(paths.has('src/god/hub.ts')).toBe(true);
		expect(paths.has('package.json')).toBe(true);
		// lockfiles ignored
		expect([...paths].some((p) => p.endsWith('package-lock.json'))).toBe(false);
		expect(Array.isArray(warnings)).toBe(true);
	});

	it('respects max-depth and emits a warning when subtrees are skipped', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'atlas-depth-'));
		mkdirSync(path.join(root, 'a', 'b', 'c'), { recursive: true });
		writeFileSync(path.join(root, 'top.ts'), 'export const t = 1;\n');
		writeFileSync(path.join(root, 'a', 'mid.ts'), 'export const m = 1;\n');
		writeFileSync(
			path.join(root, 'a', 'b', 'c', 'deep.ts'),
			'export const d = 1;\n',
		);

		const shallow = loadDirectory(root, { maxDepth: 2 });
		const paths = pathsOf(shallow.files);
		expect(paths.has('top.ts')).toBe(true);
		expect(paths.has('a/mid.ts')).toBe(true);
		expect(paths.has('a/b/c/deep.ts')).toBe(false);
		expect(
			shallow.warnings.some((w) => w.includes('max-depth') && w.includes('skipped')),
		).toBe(true);
	});

	it('default max depth is finite', () => {
		expect(DEFAULT_MAX_DEPTH).toBe(24);
	});
});

describe('loadZip vs loadDirectory parity', () => {
	it('same source path set for spaghetti fixture', () => {
		const dirFeed = loadDirectory(fixtureDir);

		// Build zip of fixture tree (same relative paths)
		const entries: Record<string, Uint8Array> = {};
		const enc = new TextEncoder();
		for (const f of dirFeed.files) {
			entries[f.path] = enc.encode(f.content);
		}
		const zipped = zipSync(entries);
		const zipRoot = mkdtempSync(path.join(tmpdir(), 'atlas-zip-'));
		const zipPath = path.join(zipRoot, 'demo.zip');
		writeFileSync(zipPath, zipped);

		const zipFeed = loadZip(zipPath);
		expect(zipFeed.source.kind).toBe('zip');

		const dirPaths = pathsOf(dirFeed.files);
		const zipPaths = pathsOf(zipFeed.files);
		expect(zipPaths).toEqual(dirPaths);
	});
});

describe('loadFeed auto-detect', () => {
	it('detects directory', () => {
		const feed = loadFeed(fixtureDir);
		expect(feed.source.kind).toBe('directory');
		expect(feed.files.length).toBeGreaterThan(10);
	});
});
