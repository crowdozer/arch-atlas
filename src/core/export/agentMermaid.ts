/**
 * Pure agent Mermaid structure graph — path-prefix (topFolder) rollup of
 * runtime file→file imports. Projection only; CodeGraph remains SoR.
 *
 * Cycles: file-level runtime SCCs always listed in %% comments (so
 * within-prefix knots like physics↔weapons stay visible). Multi-prefix
 * SCCs wrap nodes in subgraphs; size-2 mutual pairs may use <--> edges.
 *
 * Containment mode (opt-in): indexed folder/file hierarchy only — no import
 * edges / SCCs. Default presentation is **summary** (mirrors tree summary:
 * keep all dirs; expand leaves only when small folder or depth ≥ maxLeafDepth).
 * Full leaves require presentation=full (`--tree-full` on CLI).
 */

import {
	catalogCycles,
	stronglyConnectedComponents,
} from '@core/catalog/cycles.ts';
import type { CodeGraph, MapCatalog } from '@core/graph/types.ts';
import {
	buildFileTree,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
import { topFolder } from '@core/view/alluvial.ts';
import type { AgentDigestSource } from '@core/export/agentDigest.ts';

const DEFAULT_LIMIT = 40;

/**
 * Same thresholds as agentDigest `summarizeTree` / CLI tree summary default.
 * Keep in sync so toolkit vocabulary stays one policy.
 */
const SUMMARY_MAX_LEAF_DEPTH = 3;
const SUMMARY_SMALL_FOLDER_MAX = 8;

export type BuildAgentMermaidInput = {
	graph: CodeGraph;
	/** Projection mode. Default preserves the dependency rollup. */
	mode?: 'dependencies' | 'containment';
	/**
	 * Containment presentation. Default `summary` (dir skeleton + selective
	 * leaves). `full` expands leaves (CLI: `--tree-full` with `--containment`).
	 * Ignored for dependency mode.
	 */
	presentation?: 'summary' | 'full';
	/** Prefer catalog.cycles.runtime when present; else catalogCycles(graph, limit). */
	catalog?: MapCatalog;
	source: AgentDigestSource;
	/** Thin scope stamp for header comments only (omit list, presets). */
	scope?: {
		omit?: string[];
		includeTests?: boolean;
		presets?: string[];
	};
	/**
	 * Dependencies: max prefix nodes. Containment summary: max expanded file
	 * leaves (dir skeleton always complete). Containment full: max file leaves
	 * under balanced selection. Default 40.
	 */
	limit?: number;
};

type PrefixedEdge = {
	from: string;
	to: string;
	count: number;
};

/** Intermediate containment render tree (path-true; counts are index mass). */
type ContainmentNode = {
	name: string;
	path: string;
	kind: 'dir' | 'file';
	/** Descendant file count for dir labels (observed index mass). */
	fileCount?: number;
	children: ContainmentNode[];
};

function escapeLabel(label: string): string {
	return label.replace(/\\/g, '\\\\').replace(/"/g, '#quot;');
}

function edgeKey(a: string, b: string): string {
	return `${a}\0${b}`;
}

function collectFilePaths(node: FileTreeNode, paths: string[]): void {
	if (node.kind === 'file') {
		paths.push(node.path);
		return;
	}
	for (const child of node.children) collectFilePaths(child, paths);
}

function countTreeFiles(node: FileTreeNode): number {
	if (node.kind === 'file') return 1;
	let n = 0;
	for (const c of node.children) n += countTreeFiles(c);
	return n;
}

/**
 * Round-robin leaf selection across top-level (first path segment) folders so
 * early alphabet cannot consume the whole leaf budget. Paths within each
 * group stay localeCompare order. Result is sorted for stable tree rebuild.
 */
function selectBalancedLeaves(filePaths: string[], limit: number): string[] {
	if (limit <= 0) return [];
	const sorted = [...filePaths].sort((a, b) => a.localeCompare(b));
	if (sorted.length <= limit) return sorted;

	const groups = new Map<string, string[]>();
	for (const p of sorted) {
		const top = p.split('/').filter(Boolean)[0] ?? p;
		const list = groups.get(top);
		if (list) list.push(p);
		else groups.set(top, [p]);
	}
	const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
	const cursors = new Map<string, number>();
	for (const k of keys) cursors.set(k, 0);

	const kept: string[] = [];
	while (kept.length < limit) {
		let progress = false;
		for (const k of keys) {
			const list = groups.get(k)!;
			const i = cursors.get(k)!;
			if (i < list.length) {
				kept.push(list[i]!);
				cursors.set(k, i + 1);
				progress = true;
				if (kept.length >= limit) break;
			}
		}
		if (!progress) break;
	}
	return kept.sort((a, b) => a.localeCompare(b));
}

/**
 * Mirror agentDigest summarizeTree: keep all dirs; expand file leaves only
 * when depth ≥ maxLeafDepth or folder is small (fileCount ≤ smallFolderMax).
 */
function summarizeContainmentTree(
	node: FileTreeNode,
	depth: number,
): ContainmentNode {
	if (node.kind === 'file') {
		return {
			name: node.name,
			path: node.path,
			kind: 'file',
			children: [],
		};
	}
	const fileCount = countTreeFiles(node);
	const keepLeaves =
		depth >= SUMMARY_MAX_LEAF_DEPTH ||
		fileCount <= SUMMARY_SMALL_FOLDER_MAX;
	const children: ContainmentNode[] = [];
	for (const c of node.children) {
		if (c.kind === 'dir') {
			children.push(summarizeContainmentTree(c, depth + 1));
		} else if (keepLeaves) {
			children.push({
				name: c.name,
				path: c.path,
				kind: 'file',
				children: [],
			});
		}
	}
	return {
		name: node.name,
		path: node.path,
		kind: 'dir',
		fileCount,
		children,
	};
}

function fileTreeToContainment(node: FileTreeNode): ContainmentNode {
	if (node.kind === 'file') {
		return {
			name: node.name,
			path: node.path,
			kind: 'file',
			children: [],
		};
	}
	return {
		name: node.name,
		path: node.path,
		kind: 'dir',
		fileCount: countTreeFiles(node),
		children: node.children.map(fileTreeToContainment),
	};
}

function collectContainmentLeaves(
	node: ContainmentNode,
	paths: string[],
): void {
	if (node.kind === 'file') {
		paths.push(node.path);
		return;
	}
	for (const c of node.children) collectContainmentLeaves(c, paths);
}

/** Drop file leaves not in keptSet; retain every directory (skeleton complete). */
function filterContainmentLeaves(
	node: ContainmentNode,
	keptSet: Set<string>,
): ContainmentNode {
	if (node.kind === 'file') {
		return node;
	}
	const children: ContainmentNode[] = [];
	for (const c of node.children) {
		if (c.kind === 'dir') {
			children.push(filterContainmentLeaves(c, keptSet));
		} else if (keptSet.has(c.path)) {
			children.push(c);
		}
	}
	return { ...node, children };
}

function buildContainmentMermaid(
	input: BuildAgentMermaidInput,
	limit: number,
): string {
	const presentation = input.presentation ?? 'summary';
	const fullTree = buildFileTree([...input.graph.files.keys()]);
	const allFilePaths: string[] = [];
	collectFilePaths(fullTree, allFilePaths);
	allFilePaths.sort((a, b) => a.localeCompare(b));
	const totalFiles = allFilePaths.length;

	const lines = [
		'flowchart TB',
		`%% arch-atlas structure · mode=containment · presentation=${presentation} · indexed paths only`,
		'%% analysis: observed file containment · no dependency edges · not a domain map',
		`%% source: ${input.source.kind} ${input.source.path}`,
	];
	if (input.scope?.omit?.length) {
		lines.push(`%% scope.omit: ${input.scope.omit.join(', ')}`);
	}
	if (input.scope?.presets?.length) {
		lines.push(`%% scope.presets: ${input.scope.presets.join(', ')}`);
	}
	if (presentation === 'summary') {
		lines.push(
			`%% presentation=summary: dense folders rolled (maxLeafDepth=${SUMMARY_MAX_LEAF_DEPTH} · smallFolderMax=${SUMMARY_SMALL_FOLDER_MAX}); --tree-full for full leaves`,
		);
	}

	if (limit === 0) {
		if (totalFiles > 0) {
			lines.push(
				`%% truncated: showing 0 of ${totalFiles} files (limit=0)`,
			);
		}
		return lines.join('\n') + '\n';
	}

	let renderRoot: ContainmentNode;
	let shownLeaves: number;

	if (presentation === 'full') {
		const keptPaths = selectBalancedLeaves(allFilePaths, limit);
		shownLeaves = keptPaths.length;
		if (shownLeaves < totalFiles) {
			lines.push(
				`%% truncated: showing ${shownLeaves} of ${totalFiles} files (limit=${limit} · balanced)`,
			);
		}
		renderRoot = fileTreeToContainment(buildFileTree(keptPaths));
	} else {
		// Summary: full dir skeleton; selective leaves; limit caps expanded leaves.
		const summarized = summarizeContainmentTree(fullTree, 0);
		const expandedPaths: string[] = [];
		collectContainmentLeaves(summarized, expandedPaths);
		expandedPaths.sort((a, b) => a.localeCompare(b));

		const keptPaths =
			expandedPaths.length <= limit
				? expandedPaths
				: selectBalancedLeaves(expandedPaths, limit);
		shownLeaves = keptPaths.length;
		const keptSet = new Set(keptPaths);
		renderRoot = filterContainmentLeaves(summarized, keptSet);

		if (shownLeaves < totalFiles) {
			const capNote =
				expandedPaths.length > limit
					? `limit=${limit} · expanded-leaf cap`
					: `rollup · limit=${limit}`;
			lines.push(
				`%% truncated: showing ${shownLeaves} of ${totalFiles} files as leaves (${capNote})`,
			);
		}
	}

	let dirIndex = 0;
	let fileIndex = 0;

	const renderNode = (node: ContainmentNode, depth: number): void => {
		const indent = '  '.repeat(depth);
		if (node.kind === 'file') {
			lines.push(`${indent}n${fileIndex++}["${escapeLabel(node.name)}"]`);
			return;
		}
		const id = `d${dirIndex++}`;
		const count = node.fileCount ?? 0;
		const label =
			count > 0
				? `${node.name} (${count} files)`
				: node.name;
		lines.push(`${indent}subgraph ${id}["${escapeLabel(label)}"]`);
		for (const child of node.children) renderNode(child, depth + 1);
		lines.push(`${indent}end`);
	};

	for (const child of renderRoot.children) renderNode(child, 1);
	return lines.join('\n') + '\n';
}

/**
 * Build pasteable Mermaid flowchart text (no JSON wrapper, no markdown fence).
 */
export function buildAgentMermaid(input: BuildAgentMermaidInput): string {
	const limit = Math.max(0, input.limit ?? DEFAULT_LIMIT);
	if (input.mode === 'containment') {
		return buildContainmentMermaid(input, limit);
	}
	const graph = input.graph;

	// 1–3. Runtime file→file edges → prefix pairs (omit same-prefix self-loops)
	const pairCounts = new Map<string, number>();
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		if (e.typeOnly) continue;
		const a = topFolder(e.from);
		const b = topFolder(e.to);
		if (a === b) continue;
		const k = edgeKey(a, b);
		pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
	}

	const rolled: PrefixedEdge[] = [];
	const degree = new Map<string, number>();
	const allPrefixes = new Set<string>();
	for (const [k, count] of pairCounts) {
		const sep = k.indexOf('\0');
		const from = k.slice(0, sep);
		const to = k.slice(sep + 1);
		rolled.push({ from, to, count });
		allPrefixes.add(from);
		allPrefixes.add(to);
		degree.set(from, (degree.get(from) ?? 0) + count);
		degree.set(to, (degree.get(to) ?? 0) + count);
	}

	// File SCCs (always, for honesty / within-prefix cycles)
	const fileRuntime =
		input.catalog?.cycles?.runtime ??
		catalogCycles(graph, Math.max(limit, 15)).runtime;

	// Full prefix adj for SCC (before cap — force-include SCC members)
	const fullPrefixAdj = new Map<string, string[]>();
	for (const p of allPrefixes) fullPrefixAdj.set(p, []);
	for (const e of rolled) {
		const list = fullPrefixAdj.get(e.from) ?? [];
		list.push(e.to);
		fullPrefixAdj.set(e.from, list);
		if (!fullPrefixAdj.has(e.to)) fullPrefixAdj.set(e.to, []);
	}
	const fullPrefixSccs = stronglyConnectedComponents(fullPrefixAdj);

	// Prefixes forced by file SCCs (topFolder of sample paths)
	const forceFromFileScc = new Set<string>();
	for (const scc of fileRuntime) {
		for (const p of scc.samplePaths) {
			forceFromFileScc.add(topFolder(p));
		}
	}
	const forceFromPrefixScc = new Set<string>();
	for (const comp of fullPrefixSccs) {
		for (const p of comp) forceFromPrefixScc.add(p);
	}

	// 5. Cap nodes
	const forced = new Set<string>();
	for (const p of forceFromPrefixScc) {
		if (allPrefixes.has(p)) forced.add(p);
	}
	for (const p of forceFromFileScc) {
		// Only force if the prefix appears as a structure node (on a cross-prefix edge)
		// OR we still want it for comment honesty — but isolated prefixes with no
		// cross edges don't appear in the graph. Keep force only when in allPrefixes.
		if (allPrefixes.has(p)) forced.add(p);
	}

	let kept: string[];
	let truncated = false;
	if (limit === 0) {
		kept = [];
		truncated = allPrefixes.size > 0;
	} else if (allPrefixes.size <= limit) {
		kept = [...allPrefixes].sort((a, b) => a.localeCompare(b));
	} else {
		truncated = true;
		const forcedList = [...forced].sort((a, b) => a.localeCompare(b));
		const remainingSlots = Math.max(0, limit - forcedList.length);
		const candidates = [...allPrefixes]
			.filter((p) => !forced.has(p))
			.sort(
				(a, b) =>
					(degree.get(b) ?? 0) - (degree.get(a) ?? 0) ||
					a.localeCompare(b),
			);
		// If forced alone exceeds limit, take highest-degree forced first
		if (forcedList.length > limit) {
			kept = forcedList
				.sort(
					(a, b) =>
						(degree.get(b) ?? 0) - (degree.get(a) ?? 0) ||
						a.localeCompare(b),
				)
				.slice(0, limit)
				.sort((a, b) => a.localeCompare(b));
		} else {
			kept = [
				...forcedList,
				...candidates.slice(0, remainingSlots),
			].sort((a, b) => a.localeCompare(b));
		}
	}

	const keptSet = new Set(kept);

	// Edges among kept nodes
	const keptEdges = rolled
		.filter((e) => keptSet.has(e.from) && keptSet.has(e.to))
		.sort(
			(a, b) =>
				a.from.localeCompare(b.from) ||
				a.to.localeCompare(b.to),
		);

	// Prefix adj among kept (for subgraphs)
	const keptAdj = new Map<string, string[]>();
	for (const p of kept) keptAdj.set(p, []);
	for (const e of keptEdges) {
		const list = keptAdj.get(e.from) ?? [];
		list.push(e.to);
		keptAdj.set(e.from, list);
	}
	const prefixSccs = stronglyConnectedComponents(keptAdj);
	// Stable order by first member
	prefixSccs.sort(
		(a, b) => (a[0] ?? '').localeCompare(b[0] ?? '') || b.length - a.length,
	);

	// Opaque ids in sorted prefix order
	const idByPrefix = new Map<string, string>();
	kept.forEach((p, i) => idByPrefix.set(p, `n${i}`));

	const lines: string[] = [];
	lines.push('flowchart LR');
	lines.push(
		'%% arch-atlas structure · grain=topFolder · runtime file→file rollup',
	);
	lines.push(
		'%% analysis: L1 estimate topology · not LSP · not domain map · not Exact mass',
	);
	lines.push(`%% source: ${input.source.kind} ${input.source.path}`);
	if (input.scope?.omit?.length) {
		lines.push(`%% scope.omit: ${input.scope.omit.join(', ')}`);
	}
	if (input.scope?.presets?.length) {
		lines.push(`%% scope.presets: ${input.scope.presets.join(', ')}`);
	}

	// File SCC comments
	if (fileRuntime.length === 0) {
		lines.push('%% cycles.runtime (file SCC): (none)');
	} else {
		const parts = fileRuntime.map((c) => {
			const sample = c.samplePaths.join(', ');
			return `size=${c.size} sample=${sample}`;
		});
		lines.push(`%% cycles.runtime (file SCC): ${parts.join('; ')}`);
	}

	// Prefix SCC comments
	if (prefixSccs.length === 0) {
		lines.push('%% cycles.runtime (prefix SCC): (none multi-prefix)');
	} else {
		const parts = prefixSccs.map((comp) => {
			const sample = [...comp].sort((a, b) => a.localeCompare(b)).join(', ');
			return `size=${comp.length} sample=${sample}`;
		});
		lines.push(`%% cycles.runtime (prefix SCC): ${parts.join('; ')}`);
	}

	lines.push(
		'%% note: within-prefix file cycles are listed above; they collapse under one topFolder node',
	);

	if (truncated) {
		lines.push(
			`%% truncated: kept ${kept.length} of ${allPrefixes.size} prefixes (limit=${limit})`,
		);
	}

	// Subgraphs for multi-prefix SCCs
	const inScc = new Map<string, number>(); // prefix → scc index
	prefixSccs.forEach((comp, i) => {
		for (const p of comp) inScc.set(p, i);
	});

	prefixSccs.forEach((comp, i) => {
		const members = [...comp].sort((a, b) => a.localeCompare(b));
		lines.push(`  subgraph scc${i}["SCC · size ${members.length}"]`);
		for (const p of members) {
			const id = idByPrefix.get(p)!;
			lines.push(`    ${id}["${escapeLabel(p)}"]`);
		}
		lines.push('  end');
	});

	// Standalone nodes (not in any multi-prefix SCC)
	for (const p of kept) {
		if (inScc.has(p)) continue;
		const id = idByPrefix.get(p)!;
		lines.push(`  ${id}["${escapeLabel(p)}"]`);
	}

	// Edges: size-2 mutual SCC pairs → <-->; else directed
	const emittedPairs = new Set<string>(); // undirected key for bidirectional
	const countLookup = new Map<string, number>();
	for (const e of keptEdges) {
		countLookup.set(edgeKey(e.from, e.to), e.count);
	}

	// Identify size-2 SCCs with both directions
	const biPairs = new Set<string>();
	for (const comp of prefixSccs) {
		if (comp.length !== 2) continue;
		const [a, b] = [...comp].sort((x, y) => x.localeCompare(y));
		const ab = countLookup.get(edgeKey(a!, b!)) ?? 0;
		const ba = countLookup.get(edgeKey(b!, a!)) ?? 0;
		if (ab > 0 && ba > 0) {
			biPairs.add(edgeKey(a!, b!)); // sorted undirected via sorted a,b
		}
	}

	for (const e of keptEdges) {
		const [lo, hi] =
			e.from.localeCompare(e.to) <= 0
				? [e.from, e.to]
				: [e.to, e.from];
		const undirected = edgeKey(lo, hi);
		if (biPairs.has(undirected)) {
			if (emittedPairs.has(undirected)) continue;
			emittedPairs.add(undirected);
			const ab = countLookup.get(edgeKey(lo, hi)) ?? 0;
			const ba = countLookup.get(edgeKey(hi, lo)) ?? 0;
			const n = ab + ba;
			const idA = idByPrefix.get(lo)!;
			const idB = idByPrefix.get(hi)!;
			lines.push(`  ${idA} <-->|"${n}"| ${idB}`);
			continue;
		}
		const idFrom = idByPrefix.get(e.from)!;
		const idTo = idByPrefix.get(e.to)!;
		lines.push(`  ${idFrom} -->|"${e.count}"| ${idTo}`);
	}

	return lines.join('\n') + '\n';
}
