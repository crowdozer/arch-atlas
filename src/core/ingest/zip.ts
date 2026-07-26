/**
 * Browser ZIP → VirtualFile[] using fflate.
 */

import { unzipSync, strFromU8 } from 'fflate';
import { normalizePath, shouldIgnorePath } from '@core/ignore.ts';
import type { VirtualFile } from '@core/graph/types.ts';

const TEXT_EXT =
	/\.(m?[jt]sx?|cjs|mjs|json|md|css|html|svg|yml|yaml|toml|txt|map)$/i;

export type ZipIngestResult = {
	files: VirtualFile[];
	skipped: number;
	warnings: string[];
};

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

	const allPaths = Object.keys(raw)
		.map((k) => normalizePath(k))
		.filter((k) => k && !k.endsWith('/'));
	const commonRoot = detectCommonRoot(allPaths);

	const files: VirtualFile[] = [];
	let totalBytes = 0;

	for (const [name, data] of Object.entries(raw)) {
		let path = normalizePath(name);
		if (!path || path.endsWith('/')) continue;
		if (commonRoot && (path === commonRoot || path.startsWith(commonRoot + '/'))) {
			path = path === commonRoot ? path : path.slice(commonRoot.length + 1);
		}
		if (!path || shouldIgnorePath(path)) {
			skipped++;
			continue;
		}
		if (!TEXT_EXT.test(path) && !path.endsWith('package.json')) {
			if (path.includes('.')) {
				skipped++;
				continue;
			}
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
