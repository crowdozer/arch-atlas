/**
 * Build Level-1 CodeGraph from virtual files.
 */

import { normalizePath, shouldIgnorePath } from '@core/ignore.ts';
import type {
	CodeGraph,
	FileNode,
	ImportEdge,
	PackageNode,
	ParseMapEntry,
	VirtualFile,
} from '@core/graph/types.ts';
import { classifyFileParse, shouldKeepInGraph } from '@core/parse/capability.ts';
import { extractAstroImports } from '@core/parse/astroImports.ts';
import { extractImports } from '@core/parse/imports.ts';
import { extractPythonImports } from '@core/parse/pythonImports.ts';
import {
	isRelativeSpecifier,
	resolveSpecifier,
} from '@core/parse/resolve.ts';
import {
	expandAlias,
	joinPosix,
	mergePathAliases,
	parseTsconfigPaths,
	type PathAliasConfig,
} from '@core/parse/tsconfig.ts';
import type { UnresolvedReason } from '@core/graph/types.ts';

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

function dirnamePosix(path: string): string {
	const i = path.lastIndexOf('/');
	if (i <= 0) return '';
	return path.slice(0, i);
}

/**
 * Candidate paths a relative/alias specifier might resolve to (for omit stamping).
 * Best-effort — does not invent membership; only used when isOmittedPath is set.
 */
function candidateOmitPaths(
	fromPath: string,
	specifier: string,
	alias: PathAliasConfig | null,
): string[] {
	const out: string[] = [];
	const push = (c: string) => {
		const n = normalizePath(c);
		if (n) out.push(n);
	};
	if (isRelativeSpecifier(specifier)) {
		const joined = joinPosix(dirnamePosix(fromPath), specifier);
		push(joined);
		for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.astro']) {
			push(joined + ext);
			push(joinPosix(joined, `index${ext}`));
		}
	}
	if (specifier.startsWith('@/') || (alias && expandAlias(specifier, alias).length)) {
		for (const cand of expandAlias(specifier, alias)) {
			push(cand);
			for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.astro']) {
				push(cand + ext);
				push(joinPosix(cand, `index${ext}`));
			}
		}
	}
	return out;
}

export type BuildGraphOpts = {
	/**
	 * When a specifier would resolve only to an omitted feed path, stamp
	 * `toKind: 'omitted'` instead of `unresolved`. Host/CLI pass omit matcher.
	 */
	isOmittedPath?: (path: string) => boolean;
	/**
	 * Extra path aliases (CLI `--alias`) merged after tsconfig pick.
	 * Same pattern: rewrite wins.
	 */
	extraAliases?: PathAliasConfig | Array<{ pattern: string; targets: string[] }>;
};

/**
 * Classify why a non-omitted resolve miss is unresolved.
 * Prefer alias when expansion produced candidates or specifier is path-like `@/`.
 */
export function classifyUnresolvedReason(
	specifier: string,
	alias: PathAliasConfig | null,
): UnresolvedReason {
	const aliased = expandAlias(specifier, alias);
	if (aliased.length > 0) return 'alias';
	// Path-like `@/` is never a real npm scope — alias-style even without config
	if (specifier.startsWith('@/')) return 'alias';
	if (
		isRelativeSpecifier(specifier) ||
		specifier === '~' ||
		specifier.startsWith('~/')
	) {
		return 'missing';
	}
	return 'external';
}

export function buildGraph(input: VirtualFile[], opts?: BuildGraphOpts): CodeGraph {
	const contents = new Map<string, string>();
	const files = new Map<string, FileNode>();
	const packages = new Map<string, PackageNode>();
	const parseMap = new Map<string, ParseMapEntry>();
	const edges: ImportEdge[] = [];
	const packageJsonPaths: string[] = [];
	const isOmittedPath = opts?.isOmittedPath;

	for (const f of input) {
		const path = normalizePath(f.path);
		if (!path || shouldIgnorePath(path)) continue;
		if (!shouldKeepInGraph(path)) continue;

		const parse = classifyFileParse(path);
		contents.set(path, f.content);
		files.set(path, {
			id: path,
			kind: 'file',
			path,
			isSource: parse.importParseable,
			parseKind: parse.kind,
			parseNote: parse.note,
			byteLength: f.byteLength || f.content.length,
		});
		parseMap.set(path, {
			path,
			importParseable: parse.importParseable,
			kind: parse.kind,
			note: parse.note,
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
	const alias = mergePathAliases(pickAliasConfig(contents), opts?.extraAliases);
	let unresolvedCount = 0;
	let edgeSeq = 0;

	for (const [path, node] of files) {
		if (!node.isSource) continue;
		const text = contents.get(path) ?? '';
		const imports =
			node.parseKind === 'python-import'
				? extractPythonImports(text)
				: node.parseKind === 'astro-import'
					? extractAstroImports(text)
					: extractImports(text);
		for (const imp of imports) {
			const resolved = resolveSpecifier(path, imp.specifier, fileSet, alias);
			let to: string;
			let toKind: ImportEdge['toKind'];
			let unresolvedReason: UnresolvedReason | undefined;

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
				// Unresolved — may be feed-omitted rather than true miss
				let omitted = false;
				if (isOmittedPath) {
					for (const cand of candidateOmitPaths(path, imp.specifier, alias)) {
						if (isOmittedPath(cand)) {
							omitted = true;
							break;
						}
					}
				}
				if (omitted) {
					to = `omitted:${imp.specifier}`;
					toKind = 'omitted';
				} else {
					to = `unresolved:${imp.specifier}`;
					toKind = 'unresolved';
					unresolvedReason = classifyUnresolvedReason(imp.specifier, alias);
					unresolvedCount++;
				}
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
				...(imp.typeOnly ? { typeOnly: true } : {}),
				...(unresolvedReason ? { unresolvedReason } : {}),
			});
		}
	}

	const sourceCount = [...files.values()].filter((f) => f.isSource).length;
	const unparseableCount = files.size - sourceCount;

	return {
		files,
		packages,
		edges,
		contents,
		packageJsonPaths,
		parseMap,
		stats: {
			fileCount: files.size,
			sourceCount,
			parseableCount: sourceCount,
			unparseableCount,
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
