/**
 * CLI host: materialize a git ref as VirtualFile[] via `git archive` → temp ZIP → loadZip.
 * Core stays pure; all git / temp FS lives here.
 */

import { spawnSync } from 'node:child_process';
import {
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	DEFAULT_MAX_DEPTH,
	loadZip,
	type LoadFeedOpts,
	type LoadFeedResult,
} from './loadFeed.ts';

export type LoadGitRefOpts = LoadFeedOpts & {
	/** Git ref (branch, tag, SHA, HEAD^, etc.). */
	ref: string;
};

export type LoadGitRefResult = LoadFeedResult & {
	/** Resolved commit SHA (when available). */
	resolvedRef?: string;
	/** User-supplied ref string. */
	ref: string;
};

function runGit(
	repoPath: string,
	args: string[],
): { ok: true; stdout: Buffer; stderr: string } | { ok: false; error: string } {
	const r = spawnSync('git', ['-C', repoPath, ...args], {
		encoding: 'buffer',
		maxBuffer: 256 * 1024 * 1024,
	});
	if (r.error) {
		return {
			ok: false,
			error: `git not available: ${r.error.message}`,
		};
	}
	if (r.status !== 0) {
		const err =
			(r.stderr?.toString('utf8') || r.stdout?.toString('utf8') || '').trim() ||
			`git ${args[0]} exited ${r.status}`;
		return { ok: false, error: err };
	}
	return {
		ok: true,
		stdout: r.stdout ?? Buffer.alloc(0),
		stderr: r.stderr?.toString('utf8') ?? '',
	};
}

/**
 * Assert `repoPath` is inside a git work tree (or is the repo root).
 */
export function assertGitRepo(repoPath: string): void {
	const abs = path.resolve(repoPath);
	const r = runGit(abs, ['rev-parse', '--is-inside-work-tree']);
	if (!r.ok) {
		throw new Error(
			`Not a git repository (or git missing) at ${repoPath}: ${r.error}`,
		);
	}
	const flag = r.stdout.toString('utf8').trim();
	if (flag !== 'true') {
		throw new Error(`Not a git work tree: ${repoPath}`);
	}
}

/**
 * Resolve a ref to a commit object name (fails on bad ref).
 */
export function resolveGitRef(repoPath: string, ref: string): string {
	const abs = path.resolve(repoPath);
	const r = runGit(abs, ['rev-parse', '--verify', `${ref}^{commit}`]);
	if (!r.ok) {
		throw new Error(`Invalid git ref "${ref}": ${r.error}`);
	}
	return r.stdout.toString('utf8').trim();
}

/**
 * Materialize `ref` via `git archive --format=zip` into a temp file, then
 * {@link loadZip}. Temp ZIP is deleted in `finally`.
 */
export function loadGitRef(
	repoPath: string,
	opts: LoadGitRefOpts,
): LoadGitRefResult {
	const abs = path.resolve(repoPath);
	const ref = opts.ref;
	if (!ref) {
		throw new Error('loadGitRef requires opts.ref');
	}

	assertGitRepo(abs);
	const resolved = resolveGitRef(abs, ref);

	const tmpDir = mkdtempSync(path.join(tmpdir(), 'arch-atlas-git-'));
	const zipPath = path.join(tmpDir, 'archive.zip');
	const warnings: string[] = [];

	try {
		const archive = runGit(abs, [
			'archive',
			'--format=zip',
			'-o',
			zipPath,
			resolved,
		]);
		if (!archive.ok) {
			throw new Error(
				`git archive failed for ref "${ref}" (${resolved}): ${archive.error}`,
			);
		}

		const feed = loadZip(zipPath, {
			maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
			omit: opts.omit,
		});

		return {
			...feed,
			// Report repo path + ref as logical source (not temp zip path).
			source: { kind: 'zip', path: `${abs}@${ref}` },
			warnings: [
				...warnings,
				...feed.warnings,
				`materialized git ref ${ref} → ${resolved.slice(0, 12)} via git archive`,
			],
			ref,
			resolvedRef: resolved,
		};
	} finally {
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
}

/**
 * Archive ref to an in-memory buffer then write once - used when `-o` path is
 * awkward; kept for potential stream paths. Prefer {@link loadGitRef}.
 */
export function gitArchiveToZipBuffer(
	repoPath: string,
	ref: string,
): Buffer {
	const abs = path.resolve(repoPath);
	assertGitRepo(abs);
	const resolved = resolveGitRef(abs, ref);
	const r = runGit(abs, ['archive', '--format=zip', resolved]);
	if (!r.ok) {
		throw new Error(`git archive failed for "${ref}": ${r.error}`);
	}
	if (!r.stdout.length) {
		throw new Error(`git archive produced empty ZIP for ref "${ref}"`);
	}
	return r.stdout;
}

/** Test helper: write buffer ZIP to temp and loadZip (no git). */
export function loadZipBuffer(
	zipBuf: Buffer,
	opts?: LoadFeedOpts & { label?: string },
): LoadFeedResult {
	const tmpDir = mkdtempSync(path.join(tmpdir(), 'arch-atlas-zipbuf-'));
	const zipPath = path.join(tmpDir, 'feed.zip');
	try {
		writeFileSync(zipPath, zipBuf);
		const feed = loadZip(zipPath, opts);
		return {
			...feed,
			source: {
				kind: 'zip',
				path: opts?.label ?? 'buffer.zip',
			},
		};
	} finally {
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	}
}
