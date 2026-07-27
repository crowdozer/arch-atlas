/**
 * Inferred entrypoint / root catalog for Level-1 atlas.
 * Entrypoints = package.json / common names / framework routes.
 * Roots = orphan out>0 not already entrypoints.
 * scripts/debug demoted from entrypoints.
 */

import { isDebugPath, inferFileRoles } from '@core/catalog/roles.ts';
import type { CatalogStart, CodeGraph } from '@core/graph/types.ts';
import { joinPosix } from '@core/parse/tsconfig.ts';
import { fileDegreeMaps } from '@core/view/fileImporters.ts';

const COMMON_ENTRIES = [
	'src/index.ts',
	'src/index.tsx',
	'src/index.js',
	'src/main.ts',
	'src/main.tsx',
	'src/main.js',
	'src/app.ts',
	'src/app.tsx',
	'index.ts',
	'index.js',
	'app.ts',
	'app.js',
	'server.ts',
	'server.js',
	'src/server.ts',
	'cli.ts',
	'src/cli.ts',
	// Next.js App Router / middleware
	'middleware.ts',
	'middleware.js',
	'app/page.tsx',
	'app/page.ts',
	'app/page.jsx',
	'app/layout.tsx',
	'app/layout.ts',
	'pages/_app.tsx',
	'pages/_app.js',
	'pages/index.tsx',
	'pages/index.js',
];

function packageEntryPaths(graph: CodeGraph): string[] {
	const out: string[] = [];
	for (const pj of graph.packageJsonPaths) {
		const text = graph.contents.get(pj) ?? '';
		let data: {
			main?: string;
			module?: string;
			exports?: unknown;
		};
		try {
			data = JSON.parse(text);
		} catch {
			continue;
		}
		const dir = pj.includes('/') ? pj.slice(0, pj.lastIndexOf('/')) : '';
		const add = (rel: string | undefined) => {
			if (!rel || typeof rel !== 'string') return;
			const cleaned = rel.replace(/^\.\//, '');
			const full = joinPosix(dir, cleaned);
			// try as-is and with extensions via file map
			if (graph.files.has(full)) out.push(full);
			else {
				for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.js']) {
					const c = full.endsWith(ext) ? full : full + ext;
					if (graph.files.has(c)) {
						out.push(c);
						break;
					}
					const stripped = full.replace(/\.(js|mjs|cjs)$/, '');
					for (const e of ['.ts', '.tsx', '.js', '.jsx']) {
						if (graph.files.has(stripped + e)) {
							out.push(stripped + e);
							return;
						}
					}
				}
			}
		};
		add(data.main);
		add(data.module);
		if (typeof data.exports === 'string') add(data.exports);
		else if (data.exports && typeof data.exports === 'object') {
			const exp = data.exports as Record<string, unknown>;
			const dot = exp['.'];
			if (typeof dot === 'string') add(dot);
			else if (dot && typeof dot === 'object') {
				const cond = dot as Record<string, unknown>;
				for (const k of ['import', 'require', 'default', 'module']) {
					if (typeof cond[k] === 'string') add(cond[k] as string);
				}
			}
		}
	}
	return out;
}

function isFrameworkish(path: string): boolean {
	return (
		/(^|\/)(pages|routes|app)\//.test(path) ||
		/(^|\/)page\.(t|j)sx?$/.test(path) ||
		/(^|\/)route\.(t|j)sx?$/.test(path) ||
		/(^|\/)layout\.(t|j)sx?$/.test(path)
	);
}

export type CatalogStartsResult = {
	/** Merged: entrypoints then roots (compat). */
	starts: CatalogStart[];
	entrypoints: CatalogStart[];
	roots: CatalogStart[];
};

function toStart(
	path: string,
	score: number,
	reasons: string[],
	startKind: CatalogStart['startKind'],
	outDeg: Map<string, number>,
	inDeg: Map<string, number>,
	uniqueOut: Map<string, number>,
	uniqueIn: Map<string, number>,
	graph: CodeGraph,
	entrypointSet: Set<string>,
): CatalogStart {
	return {
		id: path,
		path,
		reason: reasons.join('; '),
		score,
		outDegree: outDeg.get(path) ?? 0,
		inDegree: inDeg.get(path) ?? 0,
		uniqueOut: uniqueOut.get(path) ?? 0,
		uniqueIn: uniqueIn.get(path) ?? 0,
		roles: inferFileRoles(graph, path, { entrypointSet }),
		startKind,
		epistemic: 'inferred',
	};
}

/**
 * Rank inferred start points: entrypoints first, then orphan roots.
 * scripts/debug paths are excluded from entrypoints (may still appear as roots).
 */
export function catalogStartsSplit(graph: CodeGraph, limit = 40): CatalogStartsResult {
	const { outDeg, inDeg, uniqueOut, uniqueIn } = fileDegreeMaps(graph);

	const entryScores = new Map<string, { score: number; reasons: string[] }>();
	const bumpEntry = (path: string, score: number, reason: string) => {
		if (!graph.files.has(path) || !graph.files.get(path)?.isSource) return;
		// Demote scripts/debug from declared entrypoints
		if (isDebugPath(path)) return;
		const cur = entryScores.get(path) ?? { score: 0, reasons: [] };
		cur.score += score;
		if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
		entryScores.set(path, cur);
	};

	for (const p of packageEntryPaths(graph)) {
		bumpEntry(p, 100, 'package.json entry');
	}
	for (const p of COMMON_ENTRIES) {
		if (graph.files.has(p)) bumpEntry(p, 80, 'common entry name');
	}
	for (const path of graph.files.keys()) {
		if (isFrameworkish(path) && graph.files.get(path)?.isSource) {
			bumpEntry(path, 60, 'framework-ish route/page');
		}
	}

	const entrypointSet = new Set(entryScores.keys());

	const rootScores = new Map<string, { score: number; reasons: string[] }>();
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		if (entrypointSet.has(path)) continue;
		const inn = inDeg.get(path) ?? 0;
		const out = outDeg.get(path) ?? 0;
		if (inn === 0 && out > 0) {
			const reasons = ['root (no importers)'];
			let score = 40 + Math.min(out, 20);
			if (isDebugPath(path)) {
				score = Math.floor(score * 0.4);
				reasons.push('debug/scripts demoted');
			}
			rootScores.set(path, { score, reasons });
		}
	}

	const entrypoints: CatalogStart[] = [...entryScores.entries()]
		.map(([path, v]) =>
			toStart(
				path,
				v.score,
				v.reasons,
				'entrypoint',
				outDeg,
				inDeg,
				uniqueOut,
				uniqueIn,
				graph,
				entrypointSet,
			),
		)
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

	const roots: CatalogStart[] = [...rootScores.entries()]
		.map(([path, v]) =>
			toStart(
				path,
				v.score,
				v.reasons,
				'root',
				outDeg,
				inDeg,
				uniqueOut,
				uniqueIn,
				graph,
				entrypointSet,
			),
		)
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

	// starts = entrypoints then roots (stable split recoverable)
	let starts = [...entrypoints, ...roots];

	// ensure at least something if graph has sources
	if (!starts.length) {
		const sources = [...graph.files.values()]
			.filter((f) => f.isSource)
			.sort((a, b) => a.path.localeCompare(b.path));
		for (const f of sources.slice(0, 10)) {
			starts.push(
				toStart(
					f.path,
					1,
					['fallback source file'],
					'fallback',
					outDeg,
					inDeg,
					uniqueOut,
					uniqueIn,
					graph,
					entrypointSet,
				),
			);
		}
	}

	const cap = Math.max(0, limit);
	starts = starts.slice(0, cap);
	return {
		starts,
		entrypoints: entrypoints.slice(0, cap),
		roots: roots.slice(0, cap),
	};
}

/**
 * Rank inferred start points for the map catalog (compat wrapper).
 */
export function catalogStarts(graph: CodeGraph, limit = 40): CatalogStart[] {
	return catalogStartsSplit(graph, limit).starts;
}
