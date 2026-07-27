/**
 * Pure agent-facing import-topology impact between two indexed graphs.
 * Delta-first projection — no dual digests, no raw source.
 * Hosts (CLI git archive) materialize refs; core only diffs IndexResults.
 */

import {
	fileDistances,
	fileImportedByAdj,
} from '@core/catalog/deepest.ts';
import type { CodeGraph } from '@core/graph/types.ts';
import type { IndexResult } from '@core/hostPipe.ts';
import {
	ANALYSIS_HONESTY,
	type AgentDigestGraphEdge,
} from '@core/export/agentDigest.ts';
import {
	buildAnalysisEnvelope,
	envelopeFields,
	type AnalysisEnvelopeFields,
} from '@core/export/analysisEnvelope.ts';
import { fileInDegree, fileOutDegree } from '@core/view/fileImporters.ts';

export const AGENT_IMPACT_SCHEMA = 'arch-atlas.agent-impact.v1' as const;

/** Estimate topology delta honesty (not LSP / tree-shake / co-change / rename). */
export const ANALYSIS_HONESTY_IMPACT =
	`${ANALYSIS_HONESTY}; topology delta only (not co-change / not rename-aware)`;

/** Edge equality key for set-diff: omits `line` (fragile across edits). */
export function impactEdgeKey(e: {
	from: string;
	to: string;
	toKind: string;
	form: string;
}): string {
	return `${e.from}\0${e.to}\0${e.toKind}\0${e.form}`;
}

export type AgentImpactSummaryCounts = {
	sourceCount: number;
	edgeCount: number;
	packageCount: number;
	unresolvedCount: number;
};

export type AgentImpactDegreeMover = {
	path: string;
	inDegreeBase: number;
	inDegreeHead: number;
	outDegreeBase: number;
	outDegreeHead: number;
	/** max(|Δin|, |Δout|) — ranking key */
	deltaScore: number;
};

export type AgentImpactBlastMover = {
	path: string;
	reverseReachBase: number;
	reverseReachHead: number;
	reverseMaxHopsBase: number;
	reverseMaxHopsHead: number;
	/** |Δ reverseReachFiles| — ranking key */
	deltaScore: number;
};

export type AgentImpact = {
	schema: typeof AGENT_IMPACT_SCHEMA;
	generatedAt: string;
	analysis: {
		tier: 'estimate';
		honesty: string;
	} & AnalysisEnvelopeFields;
	refs: {
		base: string;
		head: string;
		path: string;
	};
	summary: {
		base: AgentImpactSummaryCounts;
		head: AgentImpactSummaryCounts;
		delta: AgentImpactSummaryCounts;
	};
	files: {
		added: string[];
		removed: string[];
	};
	packages: {
		added: string[];
		removed: string[];
	};
	edges: {
		added: AgentDigestGraphEdge[];
		removed: AgentDigestGraphEdge[];
		addedCount: number;
		removedCount: number;
	};
	degreeMovers: AgentImpactDegreeMover[];
	blastMovers: AgentImpactBlastMover[];
	warnings: string[];
};

export type BuildAgentImpactInput = {
	base: IndexResult;
	head: IndexResult;
	refs: {
		base: string;
		head: string;
		path: string;
	};
	/** Host / materialization warnings (git archive notes, omit, etc.). */
	warnings?: string[];
	/**
	 * Cap for degreeMovers / blastMovers rankings and edge samples.
	 * Default 40. Counts (addedCount/removedCount) stay uncapped.
	 */
	limit?: number;
	/** Override clock for tests. */
	generatedAt?: string;
};

type BlastMetrics = {
	reverseReachFiles: number;
	reverseMaxHops: number;
};

/**
 * Full reverse-reach metrics for every source file (not catalog top-N only).
 * Same algorithm as catalogBlastRadius internals, without ranking cut.
 */
export function blastMetricsForGraph(
	graph: CodeGraph,
): Map<string, BlastMetrics> {
	const revAdj = fileImportedByAdj(graph);
	const out = new Map<string, BlastMetrics>();
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const { dist, maxHops } = fileDistances(graph, path, revAdj);
		out.set(path, {
			reverseReachFiles: Math.max(0, dist.size - 1),
			reverseMaxHops: maxHops,
		});
	}
	return out;
}

function sourcePathSet(graph: CodeGraph): Set<string> {
	const s = new Set<string>();
	for (const [path, node] of graph.files) {
		if (node.isSource) s.add(path);
	}
	return s;
}

function packageIdSet(graph: CodeGraph): Set<string> {
	return new Set(graph.packages.keys());
}

function setDiff(a: Set<string>, b: Set<string>): {
	added: string[];
	removed: string[];
} {
	const added: string[] = [];
	const removed: string[] = [];
	for (const x of b) {
		if (!a.has(x)) added.push(x);
	}
	for (const x of a) {
		if (!b.has(x)) removed.push(x);
	}
	added.sort((x, y) => x.localeCompare(y));
	removed.sort((x, y) => x.localeCompare(y));
	return { added, removed };
}

function summaryCounts(graph: CodeGraph): AgentImpactSummaryCounts {
	return {
		sourceCount: graph.stats.sourceCount,
		edgeCount: graph.stats.edgeCount,
		packageCount: graph.stats.packageCount,
		unresolvedCount: graph.stats.unresolvedCount,
	};
}

/**
 * Project two IndexResults into a delta-first agent impact report.
 * Never includes contents, dual digests, or full edge lists of both graphs.
 */
export function buildAgentImpact(input: BuildAgentImpactInput): AgentImpact {
	const limit = Math.max(0, input.limit ?? 40);
	const warnings = [...(input.warnings ?? [])];
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const { graph: baseG } = input.base;
	const { graph: headG } = input.head;

	const baseSummary = summaryCounts(baseG);
	const headSummary = summaryCounts(headG);

	const files = setDiff(sourcePathSet(baseG), sourcePathSet(headG));
	const packages = setDiff(packageIdSet(baseG), packageIdSet(headG));

	// Edge set-diff by key without line (multiset collapsed to set presence).
	const baseEdgeByKey = new Map<string, AgentDigestGraphEdge>();
	for (const e of baseG.edges) {
		const k = impactEdgeKey(e);
		if (!baseEdgeByKey.has(k)) {
			baseEdgeByKey.set(k, {
				from: e.from,
				to: e.to,
				toKind: e.toKind,
				form: e.form,
				line: e.line,
			});
		}
	}
	const headEdgeByKey = new Map<string, AgentDigestGraphEdge>();
	for (const e of headG.edges) {
		const k = impactEdgeKey(e);
		if (!headEdgeByKey.has(k)) {
			headEdgeByKey.set(k, {
				from: e.from,
				to: e.to,
				toKind: e.toKind,
				form: e.form,
				line: e.line,
			});
		}
	}

	const edgesAdded: AgentDigestGraphEdge[] = [];
	const edgesRemoved: AgentDigestGraphEdge[] = [];
	for (const [k, e] of headEdgeByKey) {
		if (!baseEdgeByKey.has(k)) edgesAdded.push(e);
	}
	for (const [k, e] of baseEdgeByKey) {
		if (!headEdgeByKey.has(k)) edgesRemoved.push(e);
	}
	const edgeSort = (a: AgentDigestGraphEdge, b: AgentDigestGraphEdge) =>
		a.from.localeCompare(b.from) ||
		a.to.localeCompare(b.to) ||
		a.toKind.localeCompare(b.toKind) ||
		a.form.localeCompare(b.form);
	edgesAdded.sort(edgeSort);
	edgesRemoved.sort(edgeSort);
	const addedCount = edgesAdded.length;
	const removedCount = edgesRemoved.length;

	// Degree movers: union of source paths present in either graph.
	const degreePaths = new Set<string>([
		...sourcePathSet(baseG),
		...sourcePathSet(headG),
	]);
	const degreeMoversAll: AgentImpactDegreeMover[] = [];
	for (const path of degreePaths) {
		const inBase = baseG.files.has(path) ? fileInDegree(baseG, path) : 0;
		const inHead = headG.files.has(path) ? fileInDegree(headG, path) : 0;
		const outBase = baseG.files.has(path) ? fileOutDegree(baseG, path) : 0;
		const outHead = headG.files.has(path) ? fileOutDegree(headG, path) : 0;
		const dIn = Math.abs(inHead - inBase);
		const dOut = Math.abs(outHead - outBase);
		const deltaScore = Math.max(dIn, dOut);
		if (deltaScore === 0) continue;
		degreeMoversAll.push({
			path,
			inDegreeBase: inBase,
			inDegreeHead: inHead,
			outDegreeBase: outBase,
			outDegreeHead: outHead,
			deltaScore,
		});
	}
	degreeMoversAll.sort(
		(a, b) =>
			b.deltaScore - a.deltaScore || a.path.localeCompare(b.path),
	);
	const degreeMovers = degreeMoversAll.slice(0, limit);

	// Blast movers: full reverse metrics both sides, then top-N by |Δ reach|.
	const baseBlast = blastMetricsForGraph(baseG);
	const headBlast = blastMetricsForGraph(headG);
	const blastPaths = new Set<string>([
		...baseBlast.keys(),
		...headBlast.keys(),
	]);
	const blastMoversAll: AgentImpactBlastMover[] = [];
	for (const path of blastPaths) {
		const b = baseBlast.get(path) ?? {
			reverseReachFiles: 0,
			reverseMaxHops: 0,
		};
		const h = headBlast.get(path) ?? {
			reverseReachFiles: 0,
			reverseMaxHops: 0,
		};
		const deltaScore = Math.abs(h.reverseReachFiles - b.reverseReachFiles);
		const hopsDelta = Math.abs(h.reverseMaxHops - b.reverseMaxHops);
		if (deltaScore === 0 && hopsDelta === 0) continue;
		blastMoversAll.push({
			path,
			reverseReachBase: b.reverseReachFiles,
			reverseReachHead: h.reverseReachFiles,
			reverseMaxHopsBase: b.reverseMaxHops,
			reverseMaxHopsHead: h.reverseMaxHops,
			deltaScore: deltaScore > 0 ? deltaScore : hopsDelta,
		});
	}
	blastMoversAll.sort(
		(a, b) =>
			b.deltaScore - a.deltaScore ||
			Math.abs(b.reverseMaxHopsHead - b.reverseMaxHopsBase) -
				Math.abs(a.reverseMaxHopsHead - a.reverseMaxHopsBase) ||
			a.path.localeCompare(b.path),
	);
	const blastMovers = blastMoversAll.slice(0, limit);

	if (baseSummary.sourceCount === 0 && headSummary.sourceCount === 0) {
		warnings.push(
			'Empty graphs on both refs: no import-parseable source files in either feed.',
		);
	}

	// Cap edge samples in payload; counts remain full.
	const edgesSampleAdded =
		limit > 0 ? edgesAdded.slice(0, limit) : edgesAdded;
	const edgesSampleRemoved =
		limit > 0 ? edgesRemoved.slice(0, limit) : edgesRemoved;
	if (addedCount > edgesSampleAdded.length) {
		warnings.push(
			`edges.added sample capped at ${edgesSampleAdded.length} of ${addedCount} (use --limit)`,
		);
	}
	if (removedCount > edgesSampleRemoved.length) {
		warnings.push(
			`edges.removed sample capped at ${edgesSampleRemoved.length} of ${removedCount} (use --limit)`,
		);
	}

	// P2 envelope from head graph (delta lens; topology-only — never Exact mass)
	const envelope = buildAnalysisEnvelope({
		graph: headG,
		exactApplied: false,
		honesty: ANALYSIS_HONESTY_IMPACT,
	});

	return {
		schema: AGENT_IMPACT_SCHEMA,
		generatedAt,
		analysis: {
			tier: 'estimate',
			honesty: envelope.honesty,
			...envelopeFields(envelope),
		},
		refs: { ...input.refs },
		summary: {
			base: baseSummary,
			head: headSummary,
			delta: {
				sourceCount: headSummary.sourceCount - baseSummary.sourceCount,
				edgeCount: headSummary.edgeCount - baseSummary.edgeCount,
				packageCount: headSummary.packageCount - baseSummary.packageCount,
				unresolvedCount:
					headSummary.unresolvedCount - baseSummary.unresolvedCount,
			},
		},
		files,
		packages,
		edges: {
			added: edgesSampleAdded,
			removed: edgesSampleRemoved,
			addedCount,
			removedCount,
		},
		degreeMovers,
		blastMovers,
		warnings,
	};
}
