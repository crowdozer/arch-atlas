/**
 * CLI Exact (export-surface) engine load for agent digests.
 *
 * Reuses the host-shared Exact loader order (`src/exact/`): inject → local classic
 * (`typescript-classic` / classic `createSourceFile`) → jsDelivr → unpkg.
 * There is no vendored typescript.js in-repo; the local copy is the npm
 * package at node_modules/typescript-classic (devDependency).
 *
 * Exact does **not** re-index the graph — it only improves export-surface
 * LOC rankings / honesty (same contract as web Exact).
 */

import {
	collectExportSpansFromText,
	collectExportSpansFromTs,
	coveredExportLines,
	isClassicTypescriptModule,
	loadTypescript,
	type ExportSpan,
	type TypescriptModule,
} from '@exact/index.ts';
import { requiredEngines, type CodeGraph } from '@core/index.ts';
import { fileLineCount, lineCount } from '@core/view/weight.ts';

export type ExactEngineSource = 'inject' | 'local' | 'jsdelivr' | 'unpkg';

export type ExactSurfaceMaps = {
	/** Unique lines covered by export declarations (export-surface LOC). */
	exportSurfaceLoc: Map<string, number>;
	/** Whole-file LOC (estimate) for comparison. */
	wholeFileLoc: Map<string, number>;
};

export type LoadExactSurfaceResult =
	| {
			ok: true;
			source: ExactEngineSource;
			maps: ExactSurfaceMaps;
			/** True when classic createSourceFile was used for AST spans. */
			classicAst: boolean;
	  }
	| { ok: false; error: string; tried?: string[] };

/** Re-export for CLI tests / hosts that imported from this module. */
export { coveredExportLines };

function spansForFile(
	path: string,
	content: string,
	ts: TypescriptModule | null,
): { spans: ExportSpan[]; usedAst: boolean } {
	if (ts && isClassicTypescriptModule(ts)) {
		const ast = collectExportSpansFromTs(ts, path, content);
		if (ast) return { spans: ast, usedAst: true };
	}
	return { spans: collectExportSpansFromText(content), usedAst: false };
}

/**
 * Build per-file export-surface LOC maps using classic TS when available.
 */
export function buildExportSurfaceLocMaps(
	graph: CodeGraph,
	ts: TypescriptModule | null,
): ExactSurfaceMaps & { classicAst: boolean } {
	const exportSurfaceLoc = new Map<string, number>();
	const wholeFileLoc = new Map<string, number>();
	let classicAst = false;

	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const content = graph.contents.get(path);
		const whole =
			content !== undefined ? lineCount(content) : fileLineCount(graph, path);
		wholeFileLoc.set(path, whole);
		if (content === undefined) {
			exportSurfaceLoc.set(path, 0);
			continue;
		}
		const { spans, usedAst } = spansForFile(path, content, ts);
		if (usedAst) classicAst = true;
		exportSurfaceLoc.set(path, coveredExportLines(spans));
	}

	return { exportSurfaceLoc, wholeFileLoc, classicAst };
}

export type LoadExactSurfaceOpts = {
	/** Prefer local classic only (no CDN). Default false — allow jsDelivr/unpkg. */
	localOnly?: boolean;
};

/**
 * Load classic TypeScript engine and compute export-surface LOC for graph sources.
 */
export async function loadExactExportSurface(
	graph: CodeGraph,
	opts: LoadExactSurfaceOpts = {},
): Promise<LoadExactSurfaceResult> {
	const engines = requiredEngines(graph);
	if (!engines.loadable.includes('typescript')) {
		return {
			ok: false,
			error:
				'No JS/TS sources that require the TypeScript engine (Exact export surface N/A).',
		};
	}

	const loaded = await loadTypescript({
		skipCdn: opts.localOnly === true,
	});
	if (!loaded.ok) {
		return {
			ok: false,
			error: loaded.error,
			tried: loaded.tried,
		};
	}

	const classic = isClassicTypescriptModule(loaded.ts) ? loaded.ts : null;
	const maps = buildExportSurfaceLocMaps(graph, classic);

	return {
		ok: true,
		source: loaded.source,
		maps: {
			exportSurfaceLoc: maps.exportSurfaceLoc,
			wholeFileLoc: maps.wholeFileLoc,
		},
		classicAst: maps.classicAst,
	};
}
