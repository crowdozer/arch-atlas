/**
 * Build Level-1 CodeGraph from virtual files.
 */

import { isConfigFile, isSourceFile, normalizePath, shouldIgnorePath } from '@core/ignore.ts';
import type {
	CodeGraph,
	FileNode,
	ImportEdge,
	PackageNode,
	VirtualFile,
} from '@core/graph/types.ts';
import { extractImports } from '@core/parse/imports.ts';
import { resolveSpecifier } from '@core/parse/resolve.ts';
import { parseTsconfigPaths, type PathAliasConfig } from '@core/parse/tsconfig.ts';

function pickAliasConfig(files: Map<string, string>): PathAliasConfig | null {
	const candidates = ['tsconfig.json', 'jsconfig.json', 'tsconfig.app.json', 'tsconfig.base.json'];
	for (const name of candidates) {
		// prefer root or first match
		const exact = files.get(name);
		if (exact) {
			const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
			const cfg = parseTsconfigPaths(exact, dir);
			if (cfg) return cfg;
		}
	}
	for (const [path, text] of files) {
		const base = path.split('/').pop() ?? '';
		if (base === 'tsconfig.json' || base === 'jsconfig.json') {
			const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
			const cfg = parseTsconfigPaths(text, dir);
			if (cfg) return cfg;
		}
	}
	return null;
}

function collectPackageJsonDeps(text: string): string[] {
	try {
		const data = JSON.parse(text) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		};
		const names = new Set<string>();
		for (const bag of [
			data.dependencies,
			data.devDependencies,
			data.peerDependencies,
			data.optionalDependencies,
		]) {
			if (!bag) continue;
			for (const k of Object.keys(bag)) names.add(k);
		}
		return [...names];
	} catch {
		return [];
	}
}

export function buildGraph(input: VirtualFile[]): CodeGraph {
	const contents = new Map<string, string>();
	const files = new Map<string, FileNode>();
	const packages = new Map<string, PackageNode>();
	const edges: ImportEdge[] = [];
	const packageJsonPaths: string[] = [];

	for (const f of input) {
		const path = normalizePath(f.path);
		if (!path || shouldIgnorePath(path)) continue;
		// keep source + configs + package.json for tree/analysis
		const keep =
			isSourceFile(path) ||
			isConfigFile(path) ||
			path.endsWith('package.json') ||
			// show other text-ish files in tree but don't parse
			/\.(json|md|css|html|svg|yml|yaml|toml|txt)$/i.test(path);

		if (!keep) continue;

		contents.set(path, f.content);
		files.set(path, {
			id: path,
			kind: 'file',
			path,
			isSource: isSourceFile(path),
			byteLength: f.byteLength || f.content.length,
		});
		if (path.endsWith('package.json')) packageJsonPaths.push(path);
	}

	// declared packages from package.json
	for (const pj of packageJsonPaths) {
		const text = contents.get(pj) ?? '';
		for (const name of collectPackageJsonDeps(text)) {
			if (!packages.has(name)) {
				packages.set(name, {
					id: name,
					kind: 'package',
					name,
					source: 'package.json',
					epistemic: 'observed',
				});
			}
		}
	}

	const fileSet = new Set(files.keys());
	const alias = pickAliasConfig(contents);
	let unresolvedCount = 0;
	let edgeSeq = 0;

	for (const [path, node] of files) {
		if (!node.isSource) continue;
		const text = contents.get(path) ?? '';
		const imports = extractImports(text);
		for (const imp of imports) {
			const resolved = resolveSpecifier(path, imp.specifier, fileSet, alias);
			let to: string;
			let toKind: ImportEdge['toKind'];

			if (resolved.kind === 'file') {
				to = resolved.path;
				toKind = 'file';
			} else if (resolved.kind === 'package') {
				to = resolved.name;
				toKind = 'package';
				if (!packages.has(to)) {
					packages.set(to, {
						id: to,
						kind: 'package',
						name: to,
						source: resolved.builtin ? 'builtin' : 'import',
						epistemic: 'observed',
					});
				} else if (resolved.builtin && packages.get(to)?.source !== 'builtin') {
					// keep existing
				}
			} else {
				to = `unresolved:${imp.specifier}`;
				toKind = 'unresolved';
				unresolvedCount++;
			}

			edgeSeq++;
			edges.push({
				id: `e${edgeSeq}`,
				kind: 'imports',
				from: path,
				to,
				toKind,
				specifier: imp.specifier,
				epistemic: 'observed',
				form: imp.form,
				line: imp.line,
				bindings: imp.bindings,
			});
		}
	}

	const sourceCount = [...files.values()].filter((f) => f.isSource).length;

	return {
		files,
		packages,
		edges,
		contents,
		packageJsonPaths,
		stats: {
			fileCount: files.size,
			sourceCount,
			edgeCount: edges.length,
			packageCount: packages.size,
			unresolvedCount,
		},
	};
}

/** BFS reachable file ids from a start file via import edges. */
export function reachableFiles(graph: CodeGraph, startId: string): Set<string> {
	const adj = new Map<string, string[]>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		const list = adj.get(e.from) ?? [];
		list.push(e.to);
		adj.set(e.from, list);
	}
	const seen = new Set<string>();
	const q = [startId];
	while (q.length) {
		const cur = q.pop()!;
		if (seen.has(cur)) continue;
		seen.add(cur);
		for (const n of adj.get(cur) ?? []) {
			if (!seen.has(n)) q.push(n);
		}
	}
	return seen;
}
