/**
 * Inspect-mode evidence: map alluvial clicks → observed import lines.
 * Projection helper only; graph stays SoR.
 */

import type {
	AlluvialNodeRef,
	CodeGraph,
	ImportEdge,
} from '@core/graph/types.ts';
import { edgeMatchesPackage } from '@core/view/packageImporters.ts';
import { topFolder } from '@core/view/alluvial.ts';

const MAX_SNIPPETS = 40;

export type ImportSnippet = {
	path: string;
	line: number;
	text: string;
	form: ImportEdge['form'];
	specifier: string;
	toLabel: string;
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

function toLabel(e: ImportEdge): string {
	if (e.toKind === 'unresolved') return e.specifier;
	if (e.toKind === 'package') return e.to.replace(/^unresolved:/, '');
	return e.to;
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
		const src = graph.contents.get(e.from) ?? '';
		out.push({
			path: e.from,
			line: e.line,
			text: lineText(src, e.line) || `// (line ${e.line}) ${e.form} '${e.specifier}'`,
			form: e.form,
			specifier: e.specifier,
			toLabel: toLabel(e),
		});
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
		return graph.edges.filter(
			(e) => e.toKind !== 'file' && topFolder(e.from) === ref.id,
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
		return graph.edges.filter(
			(e) => topFolder(e.from) === tgt.id && edgeMatchesPackage(e, src.id),
		);
	}
	// Module → file (conserved hop: package imports from module files)
	if (src.kind === 'module' && tgt.kind === 'file') {
		return graph.edges.filter(
			(e) => e.toKind !== 'file' && topFolder(e.from) === src.id,
		);
	}
	// File → importers (reverse): subject file left, importer right
	if (src.kind === 'file' && tgt.kind === 'file') {
		return graph.edges.filter(
			(e) => e.toKind === 'file' && e.to === src.id && e.from === tgt.id,
		);
	}
	if (src.kind === 'file' && tgt.kind === 'module') {
		return graph.edges.filter(
			(e) =>
				e.toKind === 'file' &&
				e.to === src.id &&
				topFolder(e.from) === tgt.id,
		);
	}
	// Package left → importer file/module (package reverse)
	if (
		(src.kind === 'package' || src.kind === 'unresolved') &&
		(tgt.kind === 'file' || tgt.kind === 'module')
	) {
		// already handled above for file/module; keep for completeness
		return graph.edges.filter((e) => {
			if (!edgeMatchesPackage(e, src.id)) return false;
			if (tgt.kind === 'file') return e.from === tgt.id;
			return topFolder(e.from) === tgt.id;
		});
	}

	// Fallback: intersection of both edge sets by edge id
	const a = new Set(edgesForNode(graph, src).map((e) => e.id));
	const both = edgesForNode(graph, tgt).filter((e) => a.has(e.id));
	if (both.length) return both;
	return edgesForNode(graph, src);
}
