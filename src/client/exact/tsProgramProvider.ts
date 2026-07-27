/**
 * ImportedSurfaceProvider for Exact surface mass (web host).
 *
 * Mass policy (v1, honest + coarse) — pure export-surface analysis over
 * graph.contents (see exportSurface.ts). Optional classic TypeScript module
 * (createSourceFile) is accepted for future AST refinement; mass does not
 * require it (TS 7+ default package export is version-only).
 *
 * - File edge + named/default bindings: LOC span of matching exports; unresolved → null
 * - Side-effect-only: mass 1
 * - Namespace: union of export spans (or null)
 * - Package / unresolved: caller uses 1
 *
 * Optional inspect: export snippets + word-boundary callsites.
 */

import type { CodeGraph, ImportEdge } from '@core/graph/types.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
import type { CallSiteSnippet } from '@core/view/inspect.ts';
import {
	collectExportSpansFromText,
	massForBindings,
	pickSpansForBindings,
	type ExportSpan,
} from './exportSurface.ts';

/** Minimal classic TypeScript module surface (TS 5.x / CDN UMD). Optional. */
export type TypescriptModule = {
	ScriptTarget?: { Latest?: number; ESNext?: number; [k: string]: unknown };
	ModuleKind?: { ESNext?: number; [k: string]: unknown };
	createSourceFile?: (
		fileName: string,
		sourceText: string,
		languageVersion: number,
		setParentNodes?: boolean,
		scriptKind?: number,
	) => unknown;
	[k: string]: unknown;
};

export type CreateTsProgramProviderOpts = {
	/** Optional classic typescript module (loaded engine). Mass works without it. */
	ts?: TypescriptModule | null;
	/** Snapshot of graph contents used for surface analysis. */
	contents: ReadonlyMap<string, string>;
};

const JS_TS_EXT = /\.(m?[jt]sx?|cjs|mjs)$/i;

/**
 * Build an {@link ImportedSurfaceProvider} over a contents snapshot.
 * Does not re-index the graph; mass is projection-time only.
 */
export function createTsProgramProvider(
	opts: CreateTsProgramProviderOpts,
): ImportedSurfaceProvider {
	const { contents } = opts;
	// Accept ts for inject/load proof and future AST; mass uses pure surface.
	void opts.ts;

	const spanCache = new Map<string, ExportSpan[]>();

	function spansFor(path: string): ExportSpan[] {
		if (spanCache.has(path)) return spanCache.get(path)!;
		const content = contents.get(path);
		if (content === undefined || !JS_TS_EXT.test(path)) {
			spanCache.set(path, []);
			return [];
		}
		const spans = collectExportSpansFromText(content);
		spanCache.set(path, spans);
		return spans;
	}

	return {
		targetSurfaceMass(graph: CodeGraph, edge: ImportEdge): number | null {
			void graph;
			if (edge.toKind !== 'file') return null;
			const spans = spansFor(edge.to);
			return massForBindings(edge.bindings ?? [], spans);
		},

		importedSurface(
			graph: CodeGraph,
			edge: ImportEdge,
		): { text: string; note: string } | null {
			void graph;
			if (edge.toKind !== 'file') return null;
			const spans = spansFor(edge.to);
			const picked = pickSpansForBindings(edge.bindings ?? [], spans);
			if (!picked.length) return null;
			const text = picked.map((s) => s.text.trimEnd()).join('\n\n');
			return {
				text: text.slice(0, 4000),
				note: 'Exact export surface (source spans; not full type-check)',
			};
		},

		callSites(graph: CodeGraph, edge: ImportEdge): CallSiteSnippet[] | null {
			const content = graph.contents.get(edge.from) ?? contents.get(edge.from);
			if (!content) return null;
			const locals: string[] = [];
			for (const b of edge.bindings ?? []) {
				if (b.kind === 'named' || b.kind === 'default' || b.kind === 'namespace') {
					locals.push(b.local);
				}
			}
			if (!locals.length) return [];
			const out: CallSiteSnippet[] = [];
			const lines = content.split(/\n/);
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i] ?? '';
				if (i + 1 === edge.line) continue;
				for (const sym of locals) {
					const re = new RegExp(`\\b${escapeRegExp(sym)}\\b`);
					if (re.test(line)) {
						out.push({
							path: edge.from,
							line: i + 1,
							symbol: sym,
							text: line,
						});
						if (out.length >= 24) return out;
					}
				}
			}
			return out;
		},
	};
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when a loaded module looks like classic typescript (createSourceFile). */
export function isClassicTypescriptModule(mod: unknown): mod is TypescriptModule {
	return (
		!!mod &&
		typeof mod === 'object' &&
		typeof (mod as TypescriptModule).createSourceFile === 'function'
	);
}
