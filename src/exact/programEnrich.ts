/**
 * Enrich a CodeGraph using a real TypeScript Program (feed VFS).
 *
 * - Re-resolves `toKind: 'unresolved'` edges via `ts.resolveModuleName`
 * - When the hit is inside the feed, rewrite edge to `toKind: 'file'`
 * - Optional thin L3: per-file `exportSymbolCount` via checker.getExportsOfModule
 *
 * Soft-fail: callers catch; this module throws only on hard programmer errors.
 * Pure core is not imported for createProgram - only graph types + clone/patch.
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';
import {
	createFeedProgram,
	isProgramTypescriptModule,
	resolveSpecifierWithProgram,
	type CreateFeedProgramOpts,
	type CreateFeedProgramResult,
	type ProgramTypescriptModule,
} from './programHost.ts';

export type ProgramEnrichStats = {
	/** Unresolved edges rewritten to file. */
	resolvedCount: number;
	/** Subset whose prior unresolvedReason was alias. */
	resolvedAliasCount: number;
	/** Files that received an exportSymbolCount. */
	exportSymbolFileCount: number;
	/** Program root file count. */
	rootFileCount: number;
	tsconfig: 'none' | 'partial' | 'full';
	missingLibs: string[];
};

export type ProgramEnrichResult = {
	/** True when Program was created and enrichment pass ran (even if 0 patches). */
	applied: boolean;
	graph: CodeGraph;
	/** path → export symbol count (thin L3); empty when checker unavailable. */
	exportSymbolCount: Map<string, number>;
	stats: ProgramEnrichStats;
	feedProgram: CreateFeedProgramResult;
	/** True when ≥1 file got exportSymbolCount (honest L3 gate). */
	thinL3: boolean;
};

function cloneGraphShallow(graph: CodeGraph): CodeGraph {
	return {
		files: new Map(graph.files),
		packages: new Map(graph.packages),
		edges: graph.edges.map((e) => ({ ...e })),
		contents: new Map(graph.contents),
		packageJsonPaths: [...graph.packageJsonPaths],
		parseMap: new Map(graph.parseMap),
		stats: { ...graph.stats },
	};
}

/**
 * Patch unresolved edges that Program can bind to a feed file.
 */
export function patchUnresolvedEdges(
	graph: CodeGraph,
	ts: ProgramTypescriptModule,
	feedProgram: CreateFeedProgramResult,
): { graph: CodeGraph; resolvedCount: number; resolvedAliasCount: number } {
	const next = cloneGraphShallow(graph);
	let resolvedCount = 0;
	let resolvedAliasCount = 0;

	const edges: ImportEdge[] = next.edges.map((e) => {
		if (e.toKind !== 'unresolved') return e;
		const hit = resolveSpecifierWithProgram(ts, feedProgram, e.from, e.specifier);
		if (!hit || !next.files.has(hit)) return e;
		resolvedCount++;
		if (e.unresolvedReason === 'alias') resolvedAliasCount++;
		const { unresolvedReason: _drop, ...rest } = e;
		return {
			...rest,
			to: hit,
			toKind: 'file' as const,
		};
	});

	const unresolvedCount = edges.filter((e) => e.toKind === 'unresolved').length;
	next.edges = edges;
	next.stats = {
		...next.stats,
		edgeCount: edges.length,
		unresolvedCount,
	};
	return { graph: next, resolvedCount, resolvedAliasCount };
}

/**
 * Thin L3: count export symbols per JS/TS source file via the type checker.
 * Soft: returns empty map on failure; never throws to callers of enrich.
 */
export function collectExportSymbolCounts(
	feedProgram: CreateFeedProgramResult,
): Map<string, number> {
	const out = new Map<string, number>();
	try {
		const { program } = feedProgram;
		const checker = program.getTypeChecker();
		for (const feedPath of feedProgram.feedFiles.keys()) {
			if (!/\.(m?[jt]sx?|c[jt]s)$/i.test(feedPath)) continue;
			const virtual = feedProgram.toVirtual(feedPath);
			const sf = program.getSourceFile(virtual);
			if (!sf) continue;
			const moduleSymbol =
				(typeof checker.getSymbolAtLocation === 'function'
					? checker.getSymbolAtLocation(sf)
					: undefined) ?? (sf as { symbol?: unknown }).symbol;
			if (!moduleSymbol || typeof checker.getExportsOfModule !== 'function') {
				continue;
			}
			try {
				const exports = checker.getExportsOfModule(moduleSymbol);
				out.set(feedPath, exports?.length ?? 0);
			} catch {
				/* skip file */
			}
		}
	} catch {
		return out;
	}
	return out;
}

export type EnrichGraphWithProgramOpts = CreateFeedProgramOpts & {
	/** Skip thin L3 export counts (resolve-only). Default false. */
	skipExportSymbols?: boolean;
};

/**
 * Build Program over graph.contents, patch unresolved edges, collect export counts.
 */
export function enrichGraphWithProgram(
	graph: CodeGraph,
	ts: unknown,
	opts: EnrichGraphWithProgramOpts = {},
): ProgramEnrichResult {
	if (!isProgramTypescriptModule(ts)) {
		throw new Error(
			'TypeScript module lacks createProgram/resolveModuleName (need classic typescript)',
		);
	}

	const feedProgram = createFeedProgram(graph.contents, ts, opts);
	const patched = patchUnresolvedEdges(graph, ts, feedProgram);
	const exportSymbolCount = opts.skipExportSymbols
		? new Map<string, number>()
		: collectExportSymbolCounts(feedProgram);
	const exportSymbolFileCount = exportSymbolCount.size;
	const thinL3 = exportSymbolFileCount > 0;

	return {
		applied: true,
		graph: patched.graph,
		exportSymbolCount,
		stats: {
			resolvedCount: patched.resolvedCount,
			resolvedAliasCount: patched.resolvedAliasCount,
			exportSymbolFileCount,
			rootFileCount: feedProgram.completeness.rootFileCount,
			tsconfig: feedProgram.completeness.tsconfig,
			missingLibs: [...feedProgram.completeness.missingLibs],
		},
		feedProgram,
		thinL3,
	};
}
