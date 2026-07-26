/**
 * Browser ZIP → VirtualFile[] using fflate.
 */

import { unzipSync, strFromU8 } from 'fflate';
import { normalizePath, shouldIgnorePath } from '@core/ignore.ts';
import type { VirtualFile } from '@core/graph/types.ts';

/** Extensions we decode as UTF-8 text for the Level-1 index. */
const TEXT_EXT =
	/\.(m?[jt]sx?|cjs|mjs|json|md|css|html|svg|yml|yaml|toml|txt|map)$/i;

export type ZipIngestResult = {
	files: VirtualFile[];
	skipped: number;
	warnings: string[];
};

/**
 * True for ZIP directory markers.
 * Archives (macOS / git archive / some zip tools) include empty entries for
 * folders; fflate keys them with a trailing slash or as zero-byte extensionless
 * paths. Those must never become VirtualFile leaves (tree would show folders as
 * source-like files next to the real directory).
 */
export function isZipDirectoryEntry(name: string, data: Uint8Array): boolean {
	if (name.endsWith('/') || name.endsWith('\\')) return true;
	const path = normalizePath(name);
	if (!path) return true;
	const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
	// Zero-byte, no extension → directory marker (not a text source).
	if (data.byteLength === 0 && base.length > 0 && !base.includes('.')) {
		return true;
	}
	return false;
}

function isTextPath(path: string): boolean {
	if (TEXT_EXT.test(path)) return true;
	// package.json is already covered by TEXT_EXT via .json
	return false;
}

/**
 * Decode a ZIP ArrayBuffer into virtual text files.
 */
export function ingestZip(buffer: ArrayBuffer): ZipIngestResult {
	const warnings: string[] = [];
	let skipped = 0;
	const u8 = new Uint8Array(buffer);

	let raw: Record<string, Uint8Array>;
	try {
		raw = unzipSync(u8);
	} catch (err) {
		throw new Error(
			`Failed to read ZIP: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// Pass 1: normalize + drop directory markers
	type Entry = { path: string; data: Uint8Array };
	const candidates: Entry[] = [];
	for (const [name, data] of Object.entries(raw)) {
		if (isZipDirectoryEntry(name, data)) {
			skipped++;
			continue;
		}
		const path = normalizePath(name);
		if (!path) {
			skipped++;
			continue;
		}
		candidates.push({ path, data });
	}

	const allPaths = candidates.map((e) => e.path);
	const commonRoot = detectCommonRoot(allPaths);

	// Pass 2: strip common root, ignore filters, text-only
	const staged: Entry[] = [];
	for (const { path: rawPath, data } of candidates) {
		let path = rawPath;
		if (commonRoot && (path === commonRoot || path.startsWith(commonRoot + '/'))) {
			// Root folder itself is not a file
			if (path === commonRoot) {
				skipped++;
				continue;
			}
			path = path.slice(commonRoot.length + 1);
		}
		if (!path || shouldIgnorePath(path)) {
			skipped++;
			continue;
		}
		// Only known text extensions — never keep extensionless paths
		// (closes the hole that admitted directory markers as empty files).
		if (!isTextPath(path)) {
			skipped++;
			continue;
		}
		staged.push({ path, data });
	}

	// Pass 3: drop any path that is a strict prefix of another (dir marker without slash)
	const pathSet = new Set(staged.map((e) => e.path));
	const prefixOfOther = new Set<string>();
	for (const p of pathSet) {
		const parts = p.split('/');
		for (let i = 1; i < parts.length; i++) {
			prefixOfOther.add(parts.slice(0, i).join('/'));
		}
	}

	const files: VirtualFile[] = [];
	let totalBytes = 0;

	for (const { path, data } of staged) {
		if (prefixOfOther.has(path)) {
			// Listed both as empty "file" and via children — keep children only
			skipped++;
			continue;
		}
		let content: string;
		try {
			content = strFromU8(data);
		} catch {
			skipped++;
			continue;
		}
		if (content.includes('\0')) {
			skipped++;
			continue;
		}
		totalBytes += data.byteLength;
		files.push({ path, content, byteLength: data.byteLength });
	}

	if (totalBytes > 15 * 1024 * 1024) {
		warnings.push(
			`Uncompressed text payload is large (~${Math.round(totalBytes / 1024 / 1024)}MB); indexing may be slow.`,
		);
	}
	if (files.length > 2000) {
		warnings.push(`Many files (${files.length}); UI tree may be dense.`);
	}

	return { files, skipped, warnings };
}

/** Single shared top-level folder (typical GitHub zip layout). */
export function detectCommonRoot(paths: string[]): string | null {
	if (paths.length < 2) return null;
	const tops = new Set(paths.map((k) => k.split('/')[0]).filter(Boolean));
	if (tops.size !== 1) return null;
	const top = [...tops][0]!;
	const allUnder = paths.every((k) => k === top || k.startsWith(top + '/'));
	return allUnder ? top : null;
}
