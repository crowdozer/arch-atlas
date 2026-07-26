/**
 * LogicalFocusGraph + FocusPlan — pure SoR for hub alluvial hover.
 *
 * Geometry (pads/rails/undraw) is orthogonal. Connectivity for External is
 * meta.externalStraightPairs only. Rails never enter the graph.
 *
 * Law: .grok/reference/hub-focus-behavior.md
 */

import { isAlluvialRailName } from '@core/view/alluvial.ts';
import type { AlluvialPayload } from '@core/graph/types.ts';

export type FocusNodeRef = {
	kind: string;
	id: string;
};

export type FocusLink = { source: string; target: string };

export type ExternalFocusPair = {
	parent: string;
	packageName: string;
	width?: number;
};

export type FocusSeed =
	| {
			kind: 'band';
			source: string;
			target: string;
			display: 'carbon' | 'straighten';
	  }
	| { kind: 'file'; name: string }
	| { kind: 'package'; name: string }
	| { kind: 'file-spine' };

export type FocusPlan = {
	seed: FocusSeed;
	activeLabels: ReadonlySet<string>;
	/** File: `src\0tgt`; External straighten: `ext:parent\0pkg`. */
	focusedBandKeys: ReadonlySet<string>;
	/** Optional drill chip target; wire may set independently. */
	drillTarget: string | null;
};

export type LogicalFocusGraph = {
	/** Non-rail file display names present on the hub. */
	fileNodes: ReadonlySet<string>;
	/** Package / unresolved display names from pairs + nodeRef. */
	packageNodes: ReadonlySet<string>;
	/** Directed importer → imported among non-rail file nodes. */
	fileEdges: readonly FocusLink[];
	/** parent → package from externalStraightPairs only. */
	externalEdges: readonly FocusLink[];
	nodeRef: Record<string, FocusNodeRef>;
	/** Hub File spine display name (category File / startId). */
	fileSpineName: string | null;
	/** All pair records (display labels). */
	pairs: readonly ExternalFocusPair[];
};

// —— keys ————————————————————————————————————————————————————————————————

export function fileBandKey(source: string, target: string): string {
	return `${source}\0${target}`;
}

export function externalBandKey(parent: string, packageName: string): string {
	return `ext:${parent}\0${packageName}`;
}

export function parseExternalBandKey(
	key: string,
): { parent: string; packageName: string } | null {
	if (!key.startsWith('ext:')) return null;
	const rest = key.slice(4);
	const i = rest.indexOf('\0');
	if (i < 0) return null;
	return { parent: rest.slice(0, i), packageName: rest.slice(i + 1) };
}

// —— aliases / membership ————————————————————————————————————————————————

export function expandFileAliases(
	seed: ReadonlySet<string>,
	nodeRef: Record<string, FocusNodeRef> | undefined,
): Set<string> {
	const out = new Set(seed);
	if (!nodeRef) return out;
	for (const n of seed) {
		const r = nodeRef[n];
		if (r?.kind !== 'file' || !r.id) continue;
		for (const [k, rr] of Object.entries(nodeRef)) {
			if (rr.kind === 'file' && rr.id === r.id) out.add(k);
		}
	}
	return out;
}

/** True if display name is focused, or shares a file id with a focused label. */
export function nameInFocus(
	name: string,
	active: ReadonlySet<string>,
	nodeRef: Record<string, FocusNodeRef> | undefined,
): boolean {
	if (!name) return false;
	if (active.has(name)) return true;
	if (!nodeRef) return false;
	const id = nodeRef[name]?.kind === 'file' ? nodeRef[name]!.id : null;
	if (!id) return false;
	for (const a of active) {
		const r = nodeRef[a];
		if (r?.kind === 'file' && r.id === id) return true;
	}
	return false;
}

function isFileKind(
	name: string,
	nodeRef: Record<string, FocusNodeRef> | undefined,
): boolean {
	return nodeRef?.[name]?.kind === 'file';
}

function isPackageKind(
	name: string,
	nodeRef: Record<string, FocusNodeRef> | undefined,
	pairs: readonly ExternalFocusPair[],
): boolean {
	const k = nodeRef?.[name]?.kind;
	if (k === 'package' || k === 'unresolved') return true;
	return pairs.some((p) => p.packageName === name);
}

// —— graph build ——————————————————————————————————————————————————————————

type BuildInput = {
	data: readonly FocusLink[];
	nodeRef?: Record<string, FocusNodeRef>;
	externalStraightPairs?: readonly ExternalFocusPair[];
	/** Display name of File category node, if known. */
	fileSpineName?: string | null;
	startId?: string | null;
	nodes?: readonly { name: string; category?: string }[];
};

export function buildLogicalFocusGraphFromParts(
	input: BuildInput,
): LogicalFocusGraph {
	const nodeRef = input.nodeRef ?? {};
	const pairs = input.externalStraightPairs ?? [];
	const fileEdges: FocusLink[] = [];
	const fileNodes = new Set<string>();
	const packageNodes = new Set<string>();

	for (const l of input.data) {
		if (isAlluvialRailName(l.source) || isAlluvialRailName(l.target)) {
			continue;
		}
		const sk = nodeRef[l.source]?.kind;
		const tk = nodeRef[l.target]?.kind;
		// External leaves are pairs-only; skip package endpoints in fileEdges.
		if (
			sk === 'package' ||
			sk === 'unresolved' ||
			sk === 'bucket' ||
			tk === 'package' ||
			tk === 'unresolved' ||
			tk === 'bucket'
		) {
			continue;
		}
		// Without nodeRef, still accept non-rail edges that don't look like packages
		// only when both ends appear as non-package in pairs' packageNames.
		if (
			!sk &&
			!tk &&
			(pairs.some((p) => p.packageName === l.source) ||
				pairs.some((p) => p.packageName === l.target))
		) {
			continue;
		}
		fileEdges.push({ source: l.source, target: l.target });
		fileNodes.add(l.source);
		fileNodes.add(l.target);
	}

	const externalEdges: FocusLink[] = pairs.map((p) => ({
		source: p.parent,
		target: p.packageName,
	}));
	for (const e of externalEdges) {
		fileNodes.add(e.source);
		packageNodes.add(e.target);
	}
	for (const [name, r] of Object.entries(nodeRef)) {
		if (r.kind === 'file') fileNodes.add(name);
		if (r.kind === 'package' || r.kind === 'unresolved') packageNodes.add(name);
	}

	let fileSpineName = input.fileSpineName ?? null;
	if (!fileSpineName && input.nodes) {
		const spine = input.nodes.find((n) => n.category === 'File');
		if (spine) fileSpineName = spine.name;
	}
	if (!fileSpineName && input.startId) {
		// Prefer display name matching startId
		const byId = Object.entries(nodeRef).find(
			([, r]) => r.kind === 'file' && r.id === input.startId,
		);
		fileSpineName = byId?.[0] ?? input.startId;
	}

	return {
		fileNodes,
		packageNodes,
		fileEdges,
		externalEdges,
		nodeRef,
		fileSpineName,
		pairs,
	};
}

/** Build from a full alluvial payload (hub or other). */
export function buildLogicalFocusGraph(
	payload: Pick<AlluvialPayload, 'data' | 'meta' | 'options'>,
): LogicalFocusGraph {
	return buildLogicalFocusGraphFromParts({
		data: payload.data,
		nodeRef: payload.meta.nodeRef,
		externalStraightPairs: payload.meta.externalStraightPairs,
		startId: payload.meta.startId ?? null,
		nodes: payload.options?.alluvial?.nodes,
	});
}

// —— plan ————————————————————————————————————————————————————————————————

function pushAdj(
	m: Map<string, string[]>,
	a: string,
	b: string,
): void {
	const list = m.get(a) ?? [];
	list.push(b);
	m.set(a, list);
}

function buildAdjacency(graph: LogicalFocusGraph): {
	fwd: Map<string, string[]>;
	rev: Map<string, string[]>;
} {
	const fwd = new Map<string, string[]>();
	const rev = new Map<string, string[]>();
	for (const l of graph.fileEdges) {
		pushAdj(fwd, l.source, l.target);
		pushAdj(rev, l.target, l.source);
	}
	return { fwd, rev };
}

function bfs(adj: Map<string, string[]>, start: string): Set<string> {
	const out = new Set<string>();
	const q = [start];
	out.add(start);
	while (q.length) {
		const cur = q.shift()!;
		for (const n of adj.get(cur) ?? []) {
			if (out.has(n)) continue;
			out.add(n);
			q.push(n);
		}
	}
	return out;
}

/**
 * Reverse closure from a display name, expanding file aliases as alternate
 * walk entry points (multi-instance instances share reachability by id).
 */
function reverseClosure(
	graph: LogicalFocusGraph,
	rev: Map<string, string[]>,
	start: string,
): Set<string> {
	const starts = expandFileAliases(new Set([start]), graph.nodeRef);
	const out = new Set<string>();
	for (const s of starts) {
		for (const n of bfs(rev, s)) out.add(n);
	}
	return expandFileAliases(out, graph.nodeRef);
}

function forwardClosure(
	graph: LogicalFocusGraph,
	fwd: Map<string, string[]>,
	start: string,
): Set<string> {
	const starts = expandFileAliases(new Set([start]), graph.nodeRef);
	const out = new Set<string>();
	for (const s of starts) {
		for (const n of bfs(fwd, s)) out.add(n);
	}
	return expandFileAliases(out, graph.nodeRef);
}

function bothEndsIn(
	source: string,
	target: string,
	activeFiles: ReadonlySet<string>,
	nodeRef: Record<string, FocusNodeRef>,
): boolean {
	return (
		nameInFocus(source, activeFiles, nodeRef) &&
		nameInFocus(target, activeFiles, nodeRef)
	);
}

function fileBandsBothEnds(
	graph: LogicalFocusGraph,
	activeFiles: ReadonlySet<string>,
): Set<string> {
	const keys = new Set<string>();
	for (const e of graph.fileEdges) {
		if (bothEndsIn(e.source, e.target, activeFiles, graph.nodeRef)) {
			keys.add(fileBandKey(e.source, e.target));
		}
	}
	return keys;
}

function planBand(graph: LogicalFocusGraph, seed: Extract<FocusSeed, { kind: 'band' }>): FocusPlan {
	const ends = expandFileAliases(
		new Set([seed.source, seed.target].filter(Boolean)),
		graph.nodeRef,
	);
	const key =
		seed.display === 'straighten'
			? externalBandKey(seed.source, seed.target)
			: fileBandKey(seed.source, seed.target);
	return {
		seed,
		activeLabels: ends,
		focusedBandKeys: new Set([key]),
		drillTarget: null,
	};
}

function planFile(
	graph: LogicalFocusGraph,
	name: string,
	seed: FocusSeed,
): FocusPlan {
	const { fwd, rev } = buildAdjacency(graph);
	const descendants = forwardClosure(graph, fwd, name);
	const ancestors = reverseClosure(graph, rev, name);
	const packageParentFiles = expandFileAliases(descendants, graph.nodeRef);
	const activeFiles = expandFileAliases(
		new Set([...ancestors, ...descendants]),
		graph.nodeRef,
	);

	const activeLabels = new Set(activeFiles);
	const focusedBandKeys = fileBandsBothEnds(graph, activeFiles);

	for (const e of graph.externalEdges) {
		if (nameInFocus(e.source, packageParentFiles, graph.nodeRef)) {
			activeLabels.add(e.target);
			focusedBandKeys.add(externalBandKey(e.source, e.target));
		}
	}

	// Strip any rail that snuck in (defensive)
	for (const n of [...activeLabels]) {
		if (isAlluvialRailName(n)) activeLabels.delete(n);
	}

	return {
		seed,
		activeLabels,
		focusedBandKeys,
		drillTarget: null,
	};
}

function planPackage(
	graph: LogicalFocusGraph,
	pkg: string,
	seed: FocusSeed,
): FocusPlan {
	const { rev } = buildAdjacency(graph);
	const parents = graph.pairs
		.filter((p) => p.packageName === pkg)
		.map((p) => p.parent);

	const activeFiles = new Set<string>();
	for (const parent of parents) {
		for (const n of reverseClosure(graph, rev, parent)) {
			activeFiles.add(n);
		}
	}
	const activeFilesAliased = expandFileAliases(activeFiles, graph.nodeRef);

	const activeLabels = expandFileAliases(
		new Set([...activeFilesAliased, pkg]),
		graph.nodeRef,
	);
	const focusedBandKeys = fileBandsBothEnds(graph, activeFilesAliased);

	// Inbound straighten bands into this package from true parents only
	for (const e of graph.externalEdges) {
		if (e.target !== pkg) continue;
		if (nameInFocus(e.source, activeFilesAliased, graph.nodeRef)) {
			focusedBandKeys.add(externalBandKey(e.source, e.target));
		}
	}

	for (const n of [...activeLabels]) {
		if (isAlluvialRailName(n)) activeLabels.delete(n);
	}

	return {
		seed,
		activeLabels,
		focusedBandKeys,
		drillTarget: null,
	};
}

/**
 * Produce a FocusPlan for a hover seed.
 * Seed names should be full display names (post-truncate strip at adapter).
 */
export function planFocus(graph: LogicalFocusGraph, seed: FocusSeed): FocusPlan {
	switch (seed.kind) {
		case 'band':
			return planBand(graph, seed);
		case 'file':
			return planFile(graph, seed.name, seed);
		case 'package':
			return planPackage(graph, seed.name, seed);
		case 'file-spine': {
			const name = graph.fileSpineName;
			if (!name) {
				return {
					seed,
					activeLabels: new Set(),
					focusedBandKeys: new Set(),
					drillTarget: null,
				};
			}
			return planFile(graph, name, seed);
		}
		default: {
			const _exhaustive: never = seed;
			return _exhaustive;
		}
	}
}

/**
 * Map a Carbon / DOM node display name to a FocusSeed using nodeRef + graph.
 * Rails → null. Packages/unresolved → package. File category spine → file-spine
 * when name matches spine; else file.
 */
export function seedFromNodeName(
	graph: LogicalFocusGraph,
	name: string,
): FocusSeed | null {
	if (!name || isAlluvialRailName(name)) return null;
	if (isPackageKind(name, graph.nodeRef, graph.pairs)) {
		return { kind: 'package', name };
	}
	if (graph.fileSpineName && name === graph.fileSpineName) {
		return { kind: 'file-spine' };
	}
	if (isFileKind(name, graph.nodeRef) || graph.fileNodes.has(name)) {
		return { kind: 'file', name };
	}
	// Unknown chip: treat as file label if present on graph
	if (graph.packageNodes.has(name)) {
		return { kind: 'package', name };
	}
	return { kind: 'file', name };
}

/** Strip Carbon mass suffix ` (12)` / ` (1,234)` from painted label text. */
export function stripMassSuffix(raw: string): string {
	return raw.replace(/\s+\([\d,.]+\)$/u, '');
}

// re-export helpers used by apply layer / tests
export { isAlluvialRailName, isFileKind, isPackageKind };
