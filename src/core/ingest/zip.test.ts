import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildGraph } from '@core/graph/build.ts';
import { buildFileTree } from '@core/tree/fileTree.ts';
import {
	detectCommonRoot,
	ingestZip,
	isZipDirectoryEntry,
} from './zip.ts';

function zipBuffer(entries: Record<string, string | null>): ArrayBuffer {
	/** null value → empty directory marker (zero bytes). */
	const raw: Record<string, Uint8Array> = {};
	for (const [name, content] of Object.entries(entries)) {
		raw[name] = content === null ? new Uint8Array(0) : strToU8(content);
	}
	const zipped = zipSync(raw);
	return zipped.buffer.slice(
		zipped.byteOffset,
		zipped.byteOffset + zipped.byteLength,
	);
}

describe('isZipDirectoryEntry', () => {
	it('detects trailing-slash keys', () => {
		expect(isZipDirectoryEntry('client/', new Uint8Array(0))).toBe(true);
		expect(isZipDirectoryEntry('src/app.ts', strToU8('x'))).toBe(false);
	});

	it('detects zero-byte extensionless paths as directory markers', () => {
		expect(isZipDirectoryEntry('client', new Uint8Array(0))).toBe(true);
		expect(isZipDirectoryEntry('client/boot', new Uint8Array(0))).toBe(true);
		expect(isZipDirectoryEntry('README', strToU8('hello'))).toBe(false);
	});
});

describe('ingestZip directory markers', () => {
	it('does not emit folder names as VirtualFile leaves', () => {
		const buf = zipBuffer({
			'repo/': null,
			'repo/client/': null,
			'repo/client/boot/': null,
			'repo/client/main.ts': 'export const x = 1;\n',
			'repo/client/boot/run.ts': 'export {};\n',
			'repo/config.ts': 'export {};\n',
		});
		const { files } = ingestZip(buf);
		const paths = files.map((f) => f.path).sort();
		expect(paths).toEqual([
			'client/boot/run.ts',
			'client/main.ts',
			'config.ts',
		]);
		expect(paths).not.toContain('client');
		expect(paths).not.toContain('client/boot');
		expect(paths).not.toContain('repo');
	});

	it('tree shows client as a directory, not a source file', () => {
		const buf = zipBuffer({
			'app/client/': null,
			'app/client/index.ts': 'export {};\n',
			'app/client/util.ts': 'export const n = 1;\n',
		});
		const { files } = ingestZip(buf);
		const graph = buildGraph(files);
		const parseable = new Set(
			[...graph.files.values()].filter((f) => f.isSource).map((f) => f.path),
		);
		const tree = buildFileTree([...graph.files.keys()], {
			importParseable: parseable,
		});
		const client = tree.children.find((c) => c.name === 'client');
		expect(client?.kind).toBe('dir');
		expect(client?.isSource).toBe(true);
		// no dual file sibling named client
		expect(tree.children.filter((c) => c.name === 'client')).toHaveLength(1);
		expect(graph.files.has('client')).toBe(false);
	});

	it('skips extensionless non-text paths', () => {
		const buf = zipBuffer({
			'proj/Makefile': 'all:\n',
			'proj/src/a.ts': 'export {};\n',
		});
		const { files } = ingestZip(buf);
		expect(files.map((f) => f.path)).toEqual(['src/a.ts']);
	});
});

describe('detectCommonRoot', () => {
	it('detects a single shared top folder', () => {
		expect(
			detectCommonRoot(['artillery/a.ts', 'artillery/client/b.ts']),
		).toBe('artillery');
	});

	it('returns null for mixed tops', () => {
		expect(detectCommonRoot(['a/x.ts', 'b/y.ts'])).toBeNull();
	});
});

describe('artillery.zip fixture (when present)', () => {
	it('does not treat client/ as a file leaf', () => {
		let buf: Buffer;
		try {
			buf = readFileSync('.grok/artillery.zip');
		} catch {
			// Fixture not checked in for all environments
			return;
		}
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const { files } = ingestZip(ab);
		const paths = files.map((f) => f.path);
		expect(paths).not.toContain('client');
		expect(paths).not.toContain('server');
		expect(paths.some((p) => p.startsWith('client/'))).toBe(true);

		const graph = buildGraph(files);
		const parseable = new Set(
			[...graph.files.values()].filter((f) => f.isSource).map((f) => f.path),
		);
		const tree = buildFileTree([...graph.files.keys()], {
			importParseable: parseable,
		});
		const clientNodes = tree.children.filter((c) => c.name === 'client');
		expect(clientNodes).toHaveLength(1);
		expect(clientNodes[0]!.kind).toBe('dir');

		// No extensionless file leaves under client in the graph
		for (const p of graph.files.keys()) {
			const base = p.split('/').pop()!;
			expect(base.includes('.')).toBe(true);
		}
	});
});
