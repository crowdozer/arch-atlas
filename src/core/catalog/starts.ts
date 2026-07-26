/**
 * Inferred entrypoint catalog for Level-1 atlas.
 */

import type { CatalogStart, CodeGraph } from '@core/graph/types.ts';
import { joinPosix } from '@core/parse/tsconfig.ts';

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

function inDegreeMap(graph: CodeGraph): Map<string, number> {
	const m = new Map<string, number>();
	for (const f of graph.files.keys()) m.set(f, 0);
	for (const e of graph.edges) {
		if (e.toKind === 'file') m.set(e.to, (m.get(e.to) ?? 0) + 1);
	}
	return m;
}

function outDegreeMap(graph: CodeGraph): Map<string, number> {
	const m = new Map<string, number>();
	for (const e of graph.edges) {
		m.set(e.from, (m.get(e.from) ?? 0) + 1);
	}
	return m;
}

function isFrameworkish(path: string): boolean {
	return (
		/(^|\/)(pages|routes|app)\//.test(path) ||
		/(^|\/)page\.(t|j)sx?$/.test(path) ||
		/(^|\/)route\.(t|j)sx?$/.test(path) ||
		/(^|\/)layout\.(t|j)sx?$/.test(path)
	);
}

/**
 * Rank inferred start points for the map catalog.
 */
export function catalogStarts(graph: CodeGraph, limit = 40): CatalogStart[] {
	const scores = new Map<string, { score: number; reasons: string[] }>();

	const bump = (path: string, score: number, reason: string) => {
		if (!graph.files.has(path) || !graph.files.get(path)?.isSource) return;
		const cur = scores.get(path) ?? { score: 0, reasons: [] };
		cur.score += score;
		if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
		scores.set(path, cur);
	};

	for (const p of packageEntryPaths(graph)) {
		bump(p, 100, 'package.json entry');
	}
	for (const p of COMMON_ENTRIES) {
		if (graph.files.has(p)) bump(p, 80, 'common entry name');
	}
	for (const path of graph.files.keys()) {
		if (isFrameworkish(path) && graph.files.get(path)?.isSource) {
			bump(path, 60, 'framework-ish route/page');
		}
	}

	const inDeg = inDegreeMap(graph);
	const outDeg = outDegreeMap(graph);
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const inn = inDeg.get(path) ?? 0;
		const out = outDeg.get(path) ?? 0;
		if (inn === 0 && out > 0) {
			bump(path, 40 + Math.min(out, 20), 'root (no importers)');
		}
		if (out > 0) {
			bump(path, Math.min(out, 15), 'has outgoing imports');
		}
	}

	const starts: CatalogStart[] = [...scores.entries()]
		.map(([path, v]) => ({
			id: path,
			path,
			reason: v.reasons.join('; '),
			score: v.score,
			epistemic: 'inferred' as const,
		}))
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

	// ensure at least something if graph has sources
	if (!starts.length) {
		const sources = [...graph.files.values()]
			.filter((f) => f.isSource)
			.sort((a, b) => a.path.localeCompare(b.path));
		for (const f of sources.slice(0, 10)) {
			starts.push({
				id: f.path,
				path: f.path,
				reason: 'fallback source file',
				score: 1,
				epistemic: 'inferred',
			});
		}
	}

	return starts.slice(0, limit);
}
