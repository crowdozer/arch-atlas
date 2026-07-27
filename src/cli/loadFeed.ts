/**
 * CLI host I/O: directory walk or ZIP → VirtualFile[] for indexHostFeed.
 * Core stays pure; ignore + text-extension rules match ZIP ingest.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	ingestZip,
	isTextPath,
	normalizePath,
	shouldIgnorePath,
	type VirtualFile,
} from '@core/index.ts';

/** Default max path-segment depth from walk root (finite; skip deep subtrees). */
export const DEFAULT_MAX_DEPTH = 24;

export type LoadFeedResult = {
	files: VirtualFile[];
	source: { kind: 'directory' | 'zip'; path: string };
	/** Paths skipped (ignore, non-text, binary, read errors). */
	skipped: number;
	warnings: string[];
};

export type LoadDirectoryOpts = {
	/**
	 * Max relative path segments from walk root (file or dir).
	 * Default {@link DEFAULT_MAX_DEPTH} (24).
	 * `0` or negative → unlimited (not recommended for unbounded trees).
	 */
	maxDepth?: number;
};

/**
 * Walk a directory into VirtualFile[] using the same ignore + text filters as ZIP.
 * Skips `node_modules`, `.git`, dist, etc. via {@link shouldIgnorePath}.
 * When max-depth is exceeded, the subtree is skipped and a warning is recorded.
 */
export function loadDirectory(
	dirPath: string,
	opts?: LoadDirectoryOpts,
): LoadFeedResult {
	const root = path.resolve(dirPath);
	const st = statSync(root);
	if (!st.isDirectory()) {
		throw new Error(`Not a directory: ${dirPath}`);
	}

	const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
	const unlimited = maxDepth <= 0;
	const files: VirtualFile[] = [];
	const warnings: string[] = [];
	let skipped = 0;
	/** Relative dirs already warned for max-depth (avoid spam). */
	const depthWarned = new Set<string>();

	const walk = (absDir: string, relDir: string, depth: number): void => {
		let names: string[];
		try {
			names = readdirSync(absDir);
		} catch (err) {
			warnings.push(
				`Cannot read directory ${relDir || '.'}: ${err instanceof Error ? err.message : String(err)}`,
			);
			return;
		}

		for (const name of names) {
			const abs = path.join(absDir, name);
			const rel = relDir ? `${relDir}/${name}` : name;
			const norm = normalizePath(rel);
			if (!norm) {
				skipped++;
				continue;
			}

			// Ignore before stat when path segments are known noise
			if (shouldIgnorePath(norm)) {
				skipped++;
				continue;
			}

			let childSt: ReturnType<typeof statSync>;
			try {
				childSt = statSync(abs);
			} catch {
				skipped++;
				continue;
			}

			const childDepth = depth + 1;
			if (!unlimited && childDepth > maxDepth) {
				if (childSt.isDirectory()) {
					const key = norm;
					if (!depthWarned.has(key)) {
						depthWarned.add(key);
						warnings.push(
							`max-depth ${maxDepth} exceeded; skipped subtree: ${norm}/`,
						);
					}
				}
				skipped++;
				continue;
			}

			if (childSt.isDirectory()) {
				// Also skip ignored directory names (node_modules etc. already caught)
				walk(abs, norm, childDepth);
				continue;
			}

			if (!childSt.isFile()) {
				skipped++;
				continue;
			}

			if (!isTextPath(norm)) {
				skipped++;
				continue;
			}

			try {
				const content = readFileSync(abs, 'utf8');
				if (content.includes('\0')) {
					skipped++;
					continue;
				}
				const byteLength = Buffer.byteLength(content, 'utf8');
				files.push({ path: norm, content, byteLength });
			} catch {
				skipped++;
			}
		}
	};

	walk(root, '', 0);

	if (files.length > 2000) {
		warnings.push(`Many files (${files.length}); digest may be large.`);
	}

	return {
		files,
		source: { kind: 'directory', path: root },
		skipped,
		warnings,
	};
}

/**
 * Load a ZIP file from disk via pure {@link ingestZip}.
 */
export function loadZip(zipPath: string): LoadFeedResult {
	const abs = path.resolve(zipPath);
	const st = statSync(abs);
	if (!st.isFile()) {
		throw new Error(`Not a file: ${zipPath}`);
	}
	const buf = readFileSync(abs);
	const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	const { files, skipped, warnings } = ingestZip(ab);
	return {
		files,
		source: { kind: 'zip', path: abs },
		skipped,
		warnings: [...warnings],
	};
}

/**
 * Auto-detect directory vs ZIP and load a host feed.
 * ZIP when path ends with `.zip` (case-insensitive) or is a regular file that
 * loads as ZIP; otherwise must be a directory.
 */
export function loadFeed(
	inputPath: string,
	opts?: LoadDirectoryOpts,
): LoadFeedResult {
	const abs = path.resolve(inputPath);
	let st: ReturnType<typeof statSync>;
	try {
		st = statSync(abs);
	} catch (err) {
		throw new Error(
			`Path not found: ${inputPath} (${err instanceof Error ? err.message : String(err)})`,
		);
	}

	if (st.isDirectory()) {
		return loadDirectory(abs, opts);
	}

	if (st.isFile()) {
		// .zip or any regular file that unzips (misnamed archives)
		try {
			return loadZip(abs);
		} catch (err) {
			const looksZip = /\.zip$/i.test(abs);
			if (looksZip) throw err;
			throw new Error(
				`Expected a directory or ZIP file; failed to read as ZIP: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	throw new Error(`Unsupported path type: ${inputPath}`);
}
