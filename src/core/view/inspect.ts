/**
 * Inspect-mode evidence: map alluvial clicks → observed imports + estimate
 * imported-code / callsite snippets. Projection helper only; graph stays SoR.
 *
 * Exact precision: without {@link ImportedSurfaceProvider}, fail closed
 * (blockers; no invented tree-shaken surface). With a provider, use its
 * optional `importedSurface` / `callSites` when present.
 */

import type {
	AlluvialNodeRef,
	CodeGraph,
	ImportBinding,
	ImportEdge,
} from '@core/graph/types.ts';
import { localNamesFromBindings } from '@core/parse/imports.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
import { edgeMatchesPackage } from '@core/view/packageImporters.ts';
import { pathInImporterGroup } from '@core/view/fileImporters.ts';
import {
	EXACT_NOT_IMPLEMENTED_MESSAGE,
	EXACT_SURFACE_UNRESOLVED_MESSAGE,
	type LocPrecision,
	resolveLocPrecision,
} from '@core/view/weight.ts';

/** Unique file paths that import into `fileId` (file→file edges). */
function importersOfFile(graph: CodeGraph, fileId: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file' || e.to !== fileId) continue;
		if (seen.has(e.from)) continue;
		seen.add(e.from);
		out.push(e.from);
	}
	return out;
}

/** Unique importers of a package/unresolved id (for module membership peers). */
function importersOfPackage(graph: CodeGraph, packageId: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const e of graph.edges) {
		if (!edgeMatchesPackage(e, packageId)) continue;
		if (seen.has(e.from)) continue;
		seen.add(e.from);
		out.push(e.from);
	}
	return out;
}

function inModule(
	path: string,
	moduleKey: string,
	peerPaths?: readonly string[],
): boolean {
	return pathInImporterGroup(path, moduleKey, peerPaths);
}

const MAX_SNIPPETS = 40;
const MAX_IMPORTED_LINES = 48;
const MAX_CALLSITES_PER_EDGE = 24;

export type ImportSnippet = {
	path: string;
	line: number;
	text: string;
	form: ImportEdge['form'];
	specifier: string;
	toLabel: string;
};

export type ImportedCodeSnippet = {
	epistemic: 'observed' | 'inferred';
	path: string;
	startLine: number;
	endLine: number;
	text: string;
	/** e.g. "whole file (estimate)" */
	note: string;
};

export type CallSiteSnippet = {
	epistemic: 'inferred';
	path: string;
	line: number;
	text: string;
	symbol: string;
};

export type EvidenceBlocker = {
	code:
		| 'exact-not-implemented'
		| 'exact-surface-unresolved'
		| 'no-source'
		| 'no-bindings'
		| 'package-target';
	message: string;
};

export type ImportEvidence = {
	precision: LocPrecision;
	edgeId: string;
	import: ImportSnippet;
	importedCode?: ImportedCodeSnippet;
	callsites: CallSiteSnippet[];
	blockers: EvidenceBlocker[];
};

function lineText(source: string, line: number): string {
	if (line < 1) return '';
	let start = 0;
	let current = 1;
	for (let i = 0; i < source.length; i++) {
		if (source.charCodeAt(i) === 10) {
			if (current === line) return source.slice(start, i);
			current++;
			start = i + 1;
		}
	}
	if (current === line) return source.slice(start);
	return '';
}

/** Split source into 1-based lines (no trailing empty from final newline alone). */
export function sourceLines(source: string): string[] {
	if (!source) return [];
	const parts = source.split('\n');
	if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
	return parts;
}

function toLabel(e: ImportEdge): string {
	if (e.toKind === 'unresolved') return e.specifier;
	if (e.toKind === 'package') return e.to.replace(/^unresolved:/, '');
	return e.to;
}

function snippetForEdge(graph: CodeGraph, e: ImportEdge): ImportSnippet {
	const src = graph.contents.get(e.from) ?? '';
	return {
		path: e.from,
		line: e.line,
		text: lineText(src, e.line) || `// (line ${e.line}) ${e.form} '${e.specifier}'`,
		form: e.form,
		specifier: e.specifier,
		toLabel: toLabel(e),
	};
}

/** Build snippets from edges (stable path+line order, capped). */
export function snippetsForEdges(
	graph: CodeGraph,
	edges: ImportEdge[],
): ImportSnippet[] {
	const sorted = [...edges].sort(
		(a, b) => a.from.localeCompare(b.from) || a.line - b.line || a.id.localeCompare(b.id),
	);
	const out: ImportSnippet[] = [];
	for (const e of sorted) {
		if (out.length >= MAX_SNIPPETS) break;
		out.push(snippetForEdge(graph, e));
	}
	return out;
}

/**
 * Whole-file excerpt of the import target (estimate).
 * Packages / missing source → undefined (caller adds blocker).
 */
export function importedCodeForEdge(
	graph: CodeGraph,
	e: ImportEdge,
): ImportedCodeSnippet | undefined {
	if (e.toKind !== 'file') return undefined;
	const text = graph.contents.get(e.to);
	if (text === undefined) return undefined;
	const lines = sourceLines(text);
	if (!lines.length) {
		return {
			epistemic: 'observed',
			path: e.to,
			startLine: 1,
			endLine: 1,
			text: '',
			note: 'whole file (estimate)',
		};
	}
	const slice = lines.slice(0, MAX_IMPORTED_LINES);
	const truncated = lines.length > MAX_IMPORTED_LINES;
	const body = truncated
		? `${slice.join('\n')}\n// … ${lines.length - MAX_IMPORTED_LINES} more lines (estimate cap)`
		: slice.join('\n');
	return {
		epistemic: 'observed',
		path: e.to,
		startLine: 1,
		endLine: Math.min(lines.length, MAX_IMPORTED_LINES),
		text: body,
		note: truncated
			? `whole file excerpt (estimate; ${lines.length} lines total)`
			: 'whole file (estimate)',
	};
}

/**
 * Best-effort local identifier hits in the importer for import bindings.
 * Not type-checked; excludes the import line; word-boundary match on stripped-ish lines.
 */
export function callSitesForEdge(
	graph: CodeGraph,
	e: ImportEdge,
): CallSiteSnippet[] {
	const names = localNamesFromBindings(e.bindings ?? []);
	if (!names.length) return [];
	const src = graph.contents.get(e.from);
	if (src === undefined) return [];
	const lines = sourceLines(src);
	const out: CallSiteSnippet[] = [];
	const nameSet = new Set(names);

	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1;
		if (lineNo === e.line) continue;
		const line = lines[i]!;
		// Skip obvious comment-only lines
		const trimmed = line.trim();
		if (trimmed.startsWith('//')) continue;

		for (const symbol of nameSet) {
			const re = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
			if (!re.test(line)) continue;
			out.push({
				epistemic: 'inferred',
				path: e.from,
				line: lineNo,
				text: line,
				symbol,
			});
			if (out.length >= MAX_CALLSITES_PER_EDGE) return out;
		}
	}
	return out;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map provider surface into inspect snippet shape.
 * Prefer provider file line range; fall back to excerpt-relative 1..n only when
 * the host omitted start/end (legacy injects).
 */
function exactImportedCodeFromProvider(
	e: ImportEdge,
	surface: {
		text: string;
		note: string;
		startLine?: number;
		endLine?: number;
	},
): ImportedCodeSnippet {
	const lines = sourceLines(surface.text);
	const excerptEnd = lines.length > 0 ? lines.length : 1;
	const startLine =
		typeof surface.startLine === 'number' && surface.startLine >= 1
			? surface.startLine
			: 1;
	const endLine =
		typeof surface.endLine === 'number' && surface.endLine >= startLine
			? surface.endLine
			: excerptEnd;
	return {
		epistemic: 'observed',
		path: e.toKind === 'file' ? e.to : toLabel(e),
		startLine,
		endLine,
		text: surface.text,
		note: surface.note,
	};
}

function evidenceForEdge(
	graph: CodeGraph,
	e: ImportEdge,
	precision: LocPrecision,
	surface?: ImportedSurfaceProvider | null,
): ImportEvidence {
	const blockers: EvidenceBlocker[] = [];
	const imp = snippetForEdge(graph, e);

	if (precision === 'exact') {
		// Observed import lines always remain under exact.
		if (!surface) {
			blockers.push({
				code: 'exact-not-implemented',
				message: EXACT_NOT_IMPLEMENTED_MESSAGE,
			});
			return {
				precision,
				edgeId: e.id,
				import: imp,
				callsites: [],
				blockers,
			};
		}

		let importedCode: ImportedCodeSnippet | undefined;
		if (surface.importedSurface) {
			const s = surface.importedSurface(graph, e);
			if (s) importedCode = exactImportedCodeFromProvider(e, s);
		}
		// Provider is live but this edge has no resolvable export surface
		if (!importedCode) {
			blockers.push({
				code: 'exact-surface-unresolved',
				message: EXACT_SURFACE_UNRESOLVED_MESSAGE,
			});
		}

		let callsites: CallSiteSnippet[] = [];
		if (surface.callSites) {
			const sites = surface.callSites(graph, e);
			if (sites) callsites = sites;
		}

		return {
			precision,
			edgeId: e.id,
			import: imp,
			importedCode,
			callsites,
			blockers,
		};
	}

	// estimate
	const importedCode = importedCodeForEdge(graph, e);
	if (e.toKind !== 'file') {
		blockers.push({
			code: 'package-target',
			message: 'No local source for package/unresolved target (estimate)',
		});
	} else if (!importedCode) {
		blockers.push({
			code: 'no-source',
			message: 'Target file source not available in graph',
		});
	}

	const locals = localNamesFromBindings(e.bindings ?? []);
	const callsites = callSitesForEdge(graph, e);
	if (!locals.length) {
		const onlySide =
			!e.bindings?.length ||
			e.bindings.every((b: ImportBinding) => b.kind === 'side-effect');
		if (onlySide) {
			blockers.push({
				code: 'no-bindings',
				message:
					'No named import bindings to scan for callsites (side-effect, require, or dynamic)',
			});
		}
	}

	return {
		precision,
		edgeId: e.id,
		import: imp,
		importedCode,
		callsites,
		blockers,
	};
}

/** Compose structured evidence for a set of edges (capped). */
export function evidenceForEdges(
	graph: CodeGraph,
	edges: ImportEdge[],
	precision?: LocPrecision,
	surface?: ImportedSurfaceProvider | null,
): ImportEvidence[] {
	const p = resolveLocPrecision(precision);
	const sorted = [...edges].sort(
		(a, b) => a.from.localeCompare(b.from) || a.line - b.line || a.id.localeCompare(b.id),
	);
	const out: ImportEvidence[] = [];
	for (const e of sorted) {
		if (out.length >= MAX_SNIPPETS) break;
		out.push(evidenceForEdge(graph, e, p, surface));
	}
	return out;
}

/** Edges observed for a single alluvial node identity. */
export function edgesForNode(graph: CodeGraph, ref: AlluvialNodeRef): ImportEdge[] {
	if (ref.kind === 'bucket') return [];
	if (ref.kind === 'file') {
		return graph.edges.filter(
			(e) => e.from === ref.id || (e.toKind === 'file' && e.to === ref.id),
		);
	}
	if (ref.kind === 'package' || ref.kind === 'unresolved') {
		return graph.edges.filter((e) => edgeMatchesPackage(e, ref.id));
	}
	if (ref.kind === 'module') {
		// No peer set without a focus file — use key heuristics (incl. deepen keys).
		return graph.edges.filter(
			(e) => e.toKind !== 'file' && inModule(e.from, ref.id),
		);
	}
	return [];
}

/**
 * Edges that make a band between two nodes (best-effort intersection).
 * Prefer edges whose ends match both refs; fall back to source-only if needed.
 */
export function edgesForBand(
	graph: CodeGraph,
	sourceRef: AlluvialNodeRef | null,
	targetRef: AlluvialNodeRef | null,
): ImportEdge[] {
	if (!sourceRef && !targetRef) return [];
	if (sourceRef && !targetRef) return edgesForNode(graph, sourceRef);
	if (targetRef && !sourceRef) return edgesForNode(graph, targetRef);

	const src = sourceRef!;
	const tgt = targetRef!;

	// Package → file (direct import of package by focus file)
	if (
		(src.kind === 'package' || src.kind === 'unresolved') &&
		tgt.kind === 'file'
	) {
		return graph.edges.filter(
			(e) => e.from === tgt.id && edgeMatchesPackage(e, src.id),
		);
	}
	// Package → module
	if (
		(src.kind === 'package' || src.kind === 'unresolved') &&
		tgt.kind === 'module'
	) {
		const peers = importersOfPackage(graph, src.id);
		return graph.edges.filter(
			(e) =>
				edgeMatchesPackage(e, src.id) && inModule(e.from, tgt.id, peers),
		);
	}
	// File ↔ file: reverse (hub left, importer right) or hub forward
	// (importer left → hub, hub → dep file).
	if (src.kind === 'file' && tgt.kind === 'file') {
		return graph.edges.filter(
			(e) =>
				e.toKind === 'file' &&
				((e.from === src.id && e.to === tgt.id) ||
					(e.from === tgt.id && e.to === src.id)),
		);
	}
	// File → package/unresolved (hub right side)
	if (
		src.kind === 'file' &&
		(tgt.kind === 'package' || tgt.kind === 'unresolved')
	) {
		return graph.edges.filter(
			(e) => e.from === src.id && edgeMatchesPackage(e, tgt.id),
		);
	}
	// Module → file: hub left (importer module → focus) or forward package hop
	if (src.kind === 'module' && tgt.kind === 'file') {
		const peers = importersOfFile(graph, tgt.id);
		const intoFocus = graph.edges.filter(
			(e) =>
				e.toKind === 'file' &&
				e.to === tgt.id &&
				inModule(e.from, src.id, peers),
		);
		if (intoFocus.length) return intoFocus;
		// Conserved hop: package imports from module files (forward alluvial)
		return graph.edges.filter(
			(e) => e.toKind !== 'file' && inModule(e.from, src.id),
		);
	}
	if (src.kind === 'file' && tgt.kind === 'module') {
		const peers = importersOfFile(graph, src.id);
		return graph.edges.filter(
			(e) =>
				e.toKind === 'file' &&
				e.to === src.id &&
				inModule(e.from, tgt.id, peers),
		);
	}
	// Package left → importer file/module (package reverse)
	if (
		(src.kind === 'package' || src.kind === 'unresolved') &&
		(tgt.kind === 'file' || tgt.kind === 'module')
	) {
		// already handled above for file/module; keep for completeness
		const peers =
			tgt.kind === 'module' ? importersOfPackage(graph, src.id) : undefined;
		return graph.edges.filter((e) => {
			if (!edgeMatchesPackage(e, src.id)) return false;
			if (tgt.kind === 'file') return e.from === tgt.id;
			return inModule(e.from, tgt.id, peers);
		});
	}

	// Fallback: intersection of both edge sets by edge id
	const a = new Set(edgesForNode(graph, src).map((e) => e.id));
	const both = edgesForNode(graph, tgt).filter((e) => a.has(e.id));
	if (both.length) return both;
	return edgesForNode(graph, src);
}
