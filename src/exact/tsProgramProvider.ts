/**
 * ImportedSurfaceProvider backed by classic TypeScript (`createSourceFile`)
 * over graph.contents (virtual VFS). Host-shared (`src/exact/`) — never imported from pure core.
 *
 * Mass policy (v1, honest + coarse):
 * 1. Prefer classic TS AST export spans when `ts.createSourceFile` is available
 * 2. Fall back to pure export-surface text analysis when Program/AST cannot resolve
 * 3. Never return whole-file LOC under exact
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
import {
	IMPORTED_SURFACE_CHIPS,
	statementSpan,
	type CallSiteSnippet,
} from '@core/view/inspect.ts';
import {
	collectExportSpansFromText,
	massForBindings,
	pickSpansForBindings,
	type ExportSpan,
} from './exportSurface.ts';

/** Minimal classic TypeScript module surface (TS 5.x / CDN UMD). */
export type TypescriptModule = {
	ScriptTarget?: { Latest?: number; ESNext?: number; [k: string]: unknown };
	ModuleKind?: { ESNext?: number; [k: string]: unknown };
	ScriptKind?: { TS?: number; TSX?: number; JS?: number; JSX?: number; [k: string]: unknown };
	SyntaxKind?: { ExportKeyword?: number; DefaultKeyword?: number; [k: string]: unknown };
	createSourceFile?(
		fileName: string,
		sourceText: string,
		languageVersion: number,
		setParentNodes?: boolean,
		scriptKind?: number,
	): TsSourceFile;
	forEachChild?<T>(node: TsNode, cb: (node: TsNode) => T | undefined): T | undefined;
	isFunctionDeclaration?(node: TsNode): boolean;
	isClassDeclaration?(node: TsNode): boolean;
	isInterfaceDeclaration?(node: TsNode): boolean;
	isTypeAliasDeclaration?(node: TsNode): boolean;
	isEnumDeclaration?(node: TsNode): boolean;
	isVariableStatement?(node: TsNode): boolean;
	isExportDeclaration?(node: TsNode): boolean;
	isExportAssignment?(node: TsNode): boolean;
	isModuleDeclaration?(node: TsNode): boolean;
	getLineAndCharacterOfPosition?(
		sourceFile: TsSourceFile,
		pos: number,
	): { line: number; character: number };
	[k: string]: unknown;
};

type TsNode = {
	kind: number;
	pos: number;
	end: number;
	name?: { text?: string; escapedText?: string | number; getText?(sf?: TsSourceFile): string };
	modifiers?: readonly TsNode[];
	declarationList?: { declarations?: readonly TsNode[] };
	exportClause?: {
		elements?: readonly {
			name?: { text?: string; escapedText?: string | number };
			propertyName?: { text?: string };
		}[];
		name?: { text?: string };
		isTypeOnly?: boolean;
	};
	moduleSpecifier?: { text?: string };
	expression?: TsNode;
	isTypeOnly?: boolean;
	statements?: readonly TsNode[];
	getText?(sf?: TsSourceFile): string;
};

type TsSourceFile = TsNode & {
	fileName: string;
	text: string;
	statements?: readonly TsNode[];
	getLineAndCharacterOfPosition?(pos: number): { line: number; character: number };
};

export type CreateTsProgramProviderOpts = {
	/**
	 * Classic typescript module (from loadTypescript / inject).
	 * When createSourceFile is present, mass/inspect use AST spans first.
	 */
	ts?: TypescriptModule | null;
	/** Snapshot of graph contents used for the Program VFS. */
	contents: ReadonlyMap<string, string>;
};

const JS_TS_EXT = /\.(m?[jt]sx?|cjs|mjs)$/i;

function isTsLike(path: string): boolean {
	return JS_TS_EXT.test(path);
}

function scriptKindFor(path: string, ts: TypescriptModule): number | undefined {
	const sk = ts.ScriptKind;
	if (!sk) return undefined;
	if (/\.tsx$/i.test(path)) return sk.TSX;
	if (/\.jsx$/i.test(path)) return sk.JSX;
	if (/\.[cm]?js$/i.test(path)) return sk.JS;
	return sk.TS;
}

function lineOf(sf: TsSourceFile, pos: number, ts: TypescriptModule): number {
	if (typeof sf.getLineAndCharacterOfPosition === 'function') {
		return sf.getLineAndCharacterOfPosition(pos).line + 1;
	}
	if (typeof ts.getLineAndCharacterOfPosition === 'function') {
		return ts.getLineAndCharacterOfPosition(sf, pos).line + 1;
	}
	// Fallback: count newlines in prefix
	let n = 1;
	const limit = Math.min(pos, sf.text.length);
	for (let i = 0; i < limit; i++) {
		if (sf.text.charCodeAt(i) === 10) n += 1;
	}
	return n;
}

function nodeName(node: TsNode | undefined): string | null {
	if (!node?.name) return null;
	if (typeof node.name.text === 'string') return node.name.text;
	if (typeof node.name.escapedText === 'string') return node.name.escapedText;
	return null;
}

function hasModifier(node: TsNode, kind: number | undefined): boolean {
	if (kind === undefined || !node.modifiers?.length) return false;
	return node.modifiers.some((m) => m.kind === kind);
}

/**
 * Collect export spans via classic TypeScript AST (`createSourceFile`).
 * Returns null when AST is unavailable or parse fails (caller may fall back).
 */
export function collectExportSpansFromTs(
	ts: TypescriptModule,
	path: string,
	content: string,
): ExportSpan[] | null {
	if (typeof ts.createSourceFile !== 'function') return null;
	const target =
		ts.ScriptTarget?.Latest ?? ts.ScriptTarget?.ESNext ?? 99;
	const kind = scriptKindFor(path, ts);
	let sf: TsSourceFile;
	try {
		sf =
			kind !== undefined
				? ts.createSourceFile(path, content, target, true, kind)
				: ts.createSourceFile(path, content, target, true);
	} catch {
		return null;
	}

	const exportKw = ts.SyntaxKind?.ExportKeyword ?? 95;
	const defaultKw = ts.SyntaxKind?.DefaultKeyword ?? 90;
	const out: ExportSpan[] = [];

	const push = (
		name: string,
		kindSpan: 'default' | 'named',
		start: number,
		end: number,
	) => {
		const startLine = lineOf(sf, Math.max(0, start), ts);
		const endLine = lineOf(sf, Math.max(start, end - 1), ts);
		const text = sf.text.slice(start, end);
		out.push({ name, kind: kindSpan, startLine, endLine, text });
	};

	const visit = (node: TsNode) => {
		const isDefault = hasModifier(node, defaultKw);
		const isExport = hasModifier(node, exportKw) || isDefault;

		// export function/class/interface/type/enum Name
		if (isExport) {
			const n = nodeName(node);
			if (n) {
				push(n, isDefault ? 'default' : 'named', node.pos, node.end);
			} else if (isDefault) {
				push('default', 'default', node.pos, node.end);
			}
		}

		// export const a = 1, b = 2
		if (
			ts.isVariableStatement?.(node) ||
			(node.declarationList?.declarations && hasModifier(node, exportKw))
		) {
			if (hasModifier(node, exportKw) && node.declarationList?.declarations) {
				for (const d of node.declarationList.declarations) {
					const dn = nodeName(d);
					if (dn) push(dn, 'named', d.pos, d.end);
				}
			}
		}

		// export { a, b as c } / export { a } from '…'
		if (node.exportClause?.elements) {
			for (const el of node.exportClause.elements) {
				const n =
					(typeof el.name?.text === 'string' ? el.name.text : null) ??
					(typeof el.name?.escapedText === 'string' ? el.name.escapedText : null);
				if (n) push(n, 'named', node.pos, node.end);
			}
		}

		// export default expr (ExportAssignment)
		if (ts.isExportAssignment?.(node) || (isDefault && !nodeName(node) && node.expression)) {
			// Avoid double-push if already handled
			if (!out.some((s) => s.kind === 'default' && s.startLine === lineOf(sf, node.pos, ts))) {
				push('default', 'default', node.pos, node.end);
			}
		}

		// export * as ns from '…' — exportClause.name on namespace export
		if (node.exportClause?.name && !node.exportClause.elements) {
			const n = node.exportClause.name.text;
			if (n) push(n, 'named', node.pos, node.end);
		}

		if (ts.forEachChild) {
			ts.forEachChild(node, (child) => {
				visit(child);
				return undefined;
			});
		} else if (node.statements) {
			for (const st of node.statements) visit(st);
		}
	};

	visit(sf);

	// Deduplicate identical name+span entries from overlapping walk
	const seen = new Set<string>();
	const deduped: ExportSpan[] = [];
	for (const s of out) {
		const key = `${s.kind}\0${s.name}\0${s.startLine}\0${s.endLine}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(s);
	}
	return deduped;
}

/**
 * Build an {@link ImportedSurfaceProvider} over a contents snapshot.
 * Does not re-index the graph; mass is projection-time only.
 */
export function createTsProgramProvider(
	opts: CreateTsProgramProviderOpts,
): ImportedSurfaceProvider {
	const { contents, ts } = opts;
	const classic = ts && isClassicTypescriptModule(ts) ? ts : null;

	const spanCache = new Map<string, ExportSpan[]>();
	/** True when last spansFor used classic AST for this path. */
	const astUsed = new Map<string, boolean>();

	function spansFor(path: string): ExportSpan[] {
		if (spanCache.has(path)) return spanCache.get(path)!;
		const content = contents.get(path);
		if (content === undefined || !isTsLike(path)) {
			spanCache.set(path, []);
			astUsed.set(path, false);
			return [];
		}

		// 1) Program/AST path (classic createSourceFile)
		if (classic) {
			const astSpans = collectExportSpansFromTs(classic, path, content);
			if (astSpans && astSpans.length > 0) {
				spanCache.set(path, astSpans);
				astUsed.set(path, true);
				return astSpans;
			}
			// AST available but empty exports — still trust AST (no silent whole-file)
			if (astSpans) {
				spanCache.set(path, astSpans);
				astUsed.set(path, true);
				return astSpans;
			}
		}

		// 2) Fallback: pure export-surface text analysis
		const textSpans = collectExportSpansFromText(content);
		spanCache.set(path, textSpans);
		astUsed.set(path, false);
		return textSpans;
	}

	function surfaceNote(path: string): string {
		return astUsed.get(path)
			? IMPORTED_SURFACE_CHIPS.exactAst
			: IMPORTED_SURFACE_CHIPS.exactText;
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
		): {
			text: string;
			note: string;
			startLine?: number;
			endLine?: number;
		} | null {
			void graph;
			if (edge.toKind !== 'file') return null;
			const spans = spansFor(edge.to);
			const picked = pickSpansForBindings(edge.bindings ?? [], spans);
			if (!picked.length) return null;
			const text = picked.map((s) => s.text.trimEnd()).join('\n\n');
			const startLine = Math.min(...picked.map((s) => s.startLine));
			const endLine = Math.max(...picked.map((s) => s.endLine));
			return {
				text: text.slice(0, 4000),
				note: surfaceNote(edge.to),
				startLine,
				endLine,
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
			// Exclude full multi-line import clause (not only the start line).
			const span = statementSpan(content, edge.line, edge.form, edge.specifier);
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i] ?? '';
				const lineNo = i + 1;
				if (lineNo >= span.startLine && lineNo <= span.endLine) continue;
				for (const sym of locals) {
					const re = new RegExp(`\\b${escapeRegExp(sym)}\\b`);
					if (re.test(line)) {
						out.push({
							epistemic: 'inferred',
							path: edge.from,
							line: lineNo,
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
