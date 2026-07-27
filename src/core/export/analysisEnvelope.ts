/**
 * Analysis-protocol P2+ envelope + portable artifact helpers (pure core).
 *
 * Stamps capabilities **actually available** for this run (L0–L2; optional
 * Program-backed L2/thin L3 when host passes program stamps), completeness
 * hints, and a wrapper schema hosts can share.
 * Never claims LSP / L4 / full public-member L3 without real evidence.
 */

import type { CodeGraph } from '@core/graph/types.ts';
import {
	expandAlias,
	mergePathAliases,
	pickAliasConfig,
	type PathAliasConfig,
} from '@core/parse/tsconfig.ts';

/** Alias rewrite stamp (matches AgentAliasRewrite; kept local to avoid cycles). */
export type EnvelopeAliasRewrite = {
	pattern: string;
	targets: string[];
};

/** Default L1 honesty when callers do not supply a lens-specific string. */
const DEFAULT_ENVELOPE_HONESTY =
	'Level-1 static import graph (JS/TS + Python); not LSP / not tree-shake';

/** Wire id for the analysis-protocol envelope (additive under agent lenses). */
export const ANALYSIS_PROTOCOL_ID = 'arch-atlas.analysis.v1' as const;

/** Portable artifact wrapper schema (CLI `--artifact`; future browser open). */
export const PORTABLE_ARTIFACT_SCHEMA = 'arch-atlas.artifact.v1' as const;

export type AnalysisCapability = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | (string & {});

export type CapabilityDetailImportGraph = 'syntax' | 'resolved' | 'program';
export type CapabilityDetailMass =
	| 'whole-file'
	| 'export-declaration-span'
	| 'public-member'
	| 'unsupported';
export type CapabilityDetailTypeEdges = 'none' | 'import-type-flag' | 'checker';
export type CapabilityDetailAliases =
	| 'none'
	| 'tsconfig'
	| 'rewrite-map'
	| 'program';

export type CapabilityDetail = {
	importGraph: CapabilityDetailImportGraph;
	mass: CapabilityDetailMass;
	typeEdges: CapabilityDetailTypeEdges;
	aliases: CapabilityDetailAliases;
};

export type AnalysisCompleteness = {
	tsconfig: 'none' | 'partial' | 'full';
	nodeModules: 'absent' | 'partial' | 'present';
	workspaceRoots: number;
	missingLibs?: string[];
};

/**
 * Shared analysis stamp for agent digests / tree / file / impact.
 * Additive under existing `analysis` objects (tier / fileLens stay lens-local).
 */
export type AnalysisEnvelope = {
	protocol: typeof ANALYSIS_PROTOCOL_ID;
	capabilities: AnalysisCapability[];
	capabilityDetail: CapabilityDetail;
	completeness: AnalysisCompleteness;
	honesty: string;
};

export type BuildAnalysisEnvelopeInput = {
	graph: CodeGraph;
	/** Exact export-surface mass overlay applied for this run. */
	exactApplied?: boolean;
	/**
	 * CLI `--alias` rewrites (or host-injected rewrite map).
	 * Presence stamps aliases: rewrite-map and may enable L2 when they resolve.
	 */
	aliasRewrites?: readonly EnvelopeAliasRewrite[];
	/** Override honesty string (file / impact / exact lenses). */
	honesty?: string;
	/**
	 * Host override for node_modules completeness.
	 * Default `absent` — current hosts ignore/filter node_modules from the feed.
	 */
	nodeModules?: AnalysisCompleteness['nodeModules'];
	/**
	 * CLI `--program`: real createProgram enrichment ran (soft-fail not set).
	 * Stamps importGraph `program`, ensures L2, aliases may become `program`.
	 */
	programApplied?: boolean;
	/**
	 * Thin L3: ≥1 file received exportSymbolCount from Program checker.
	 * Only then is L3 claimed — never from export-declaration span alone.
	 */
	thinL3Applied?: boolean;
	/**
	 * Host completeness overrides from Program host (tsconfig / missing libs).
	 */
	programCompleteness?: {
		tsconfig?: AnalysisCompleteness['tsconfig'];
		missingLibs?: string[];
	};
};

/**
 * Alias of `pickAliasConfig` — same owner as graph build (no twin pick logic).
 * Kept for envelope/public callers that prefer the detect* name.
 */
export function detectTsconfigAlias(
	contents: ReadonlyMap<string, string>,
): PathAliasConfig | null {
	return pickAliasConfig(contents);
}

function hasTsconfigFile(contents: ReadonlyMap<string, string>): boolean {
	for (const path of contents.keys()) {
		const base = path.split('/').pop() ?? '';
		if (
			base === 'tsconfig.json' ||
			base === 'jsconfig.json' ||
			/^tsconfig\..+\.json$/.test(base)
		) {
			return true;
		}
	}
	return false;
}

/**
 * True when at least one import edge resolved to a file via alias expansion
 * (tsconfig paths or rewrite-map actually helped).
 */
export function aliasHelpedResolve(
	graph: CodeGraph,
	alias: PathAliasConfig | null,
): boolean {
	if (!alias?.paths.length) return false;
	for (const e of graph.edges) {
		if (e.toKind !== 'file') continue;
		const expanded = expandAlias(e.specifier, alias);
		if (expanded.length > 0) return true;
	}
	return false;
}

/**
 * Build the P2 analysis envelope for a single indexed graph + host stamps.
 */
export function buildAnalysisEnvelope(
	input: BuildAnalysisEnvelopeInput,
): AnalysisEnvelope {
	const { graph } = input;
	const rewrites = input.aliasRewrites;
	const hasRewrites = Boolean(rewrites?.length);
	// Same pick as graph build — single owner in parse/tsconfig.ts
	const tsconfigCfg = pickAliasConfig(graph.contents);
	const hasTsconfigPaths = Boolean(tsconfigCfg?.paths.length);
	const tsconfigPresent = hasTsconfigFile(graph.contents);

	const programApplied = Boolean(input.programApplied);
	const thinL3Applied = Boolean(input.thinL3Applied);

	const aliases: CapabilityDetailAliases = programApplied
		? 'program'
		: hasRewrites
			? 'rewrite-map'
			: hasTsconfigPaths
				? 'tsconfig'
				: 'none';

	// Same merge as graph build (rewrite wins on pattern)
	const merged = mergePathAliases(
		tsconfigCfg,
		rewrites?.length ? [...rewrites] : undefined,
	);
	const l2Helped = aliasHelpedResolve(graph, merged);

	const capabilities: AnalysisCapability[] = ['L0'];
	if (graph.stats.sourceCount > 0) {
		capabilities.push('L1');
	}
	// L2: alias/tsconfig helped, or Program enrichment applied
	if (l2Helped || programApplied) {
		capabilities.push('L2');
	}
	// L3 only when thin Program export-symbol counts actually landed
	if (thinL3Applied) {
		capabilities.push('L3');
	}
	// Never L4 without build integration

	const hasTypeOnly = graph.edges.some((e) => e.typeOnly === true);
	const exactApplied = Boolean(input.exactApplied);

	const capabilityDetail: CapabilityDetail = {
		importGraph: programApplied ? 'program' : l2Helped ? 'resolved' : 'syntax',
		mass: exactApplied ? 'export-declaration-span' : 'whole-file',
		typeEdges: hasTypeOnly ? 'import-type-flag' : 'none',
		aliases,
	};

	const tsconfigFromProgram = input.programCompleteness?.tsconfig;
	const tsconfigCompleteness: AnalysisCompleteness['tsconfig'] =
		tsconfigFromProgram ??
		(!tsconfigPresent ? 'none' : hasTsconfigPaths ? 'full' : 'partial');

	// Current hosts strip/ignore node_modules — stamp absent unless host overrides.
	const nodeModules = input.nodeModules ?? 'absent';

	const packageRoots = graph.packageJsonPaths?.length
		? graph.packageJsonPaths.length
		: graph.contents.has('package.json')
			? 1
			: 0;
	const workspaceRoots = Math.max(1, packageRoots || 1);

	const honesty = input.honesty ?? DEFAULT_ENVELOPE_HONESTY;

	const missingLibs = input.programCompleteness?.missingLibs?.filter(Boolean);
	const completeness: AnalysisCompleteness = {
		tsconfig: tsconfigCompleteness,
		nodeModules,
		workspaceRoots,
		...(missingLibs?.length ? { missingLibs: [...missingLibs] } : {}),
	};

	return {
		protocol: ANALYSIS_PROTOCOL_ID,
		capabilities,
		capabilityDetail,
		completeness,
		honesty,
	};
}

/** Fields shared into lens `analysis` objects (spread after lens-local fields). */
export type AnalysisEnvelopeFields = Pick<
	AnalysisEnvelope,
	'protocol' | 'capabilities' | 'capabilityDetail' | 'completeness'
>;

/** Pick protocol stamps for merging into an existing analysis block. */
export function envelopeFields(
	env: AnalysisEnvelope,
): AnalysisEnvelopeFields {
	return {
		protocol: env.protocol,
		capabilities: env.capabilities,
		capabilityDetail: env.capabilityDetail,
		completeness: env.completeness,
	};
}

// ── Portable artifact ──────────────────────────────────────────────────────

export type PortableArtifactFormat = 'agent-digest';

/**
 * Wrapper so browser / extension hosts can open a CLI-written pack without
 * guessing schema from bare agent-digest.v1.
 */
export type PortableArtifact = {
	schema: typeof PORTABLE_ARTIFACT_SCHEMA;
	/** Which agent lens payload embeds (digest today). */
	format: PortableArtifactFormat;
	generatedAt: string;
	/** Full agent-digest (or future lens) payload. */
	payload: Record<string, unknown>;
};

/**
 * Wrap an agent digest as `arch-atlas.artifact.v1` for CLI `--artifact` / exchange.
 */
export function toPortableArtifact(
	digest: object,
	opts?: { generatedAt?: string },
): PortableArtifact {
	const rec = digest as Record<string, unknown>;
	const generatedAt =
		opts?.generatedAt ??
		(typeof rec.generatedAt === 'string'
			? rec.generatedAt
			: new Date().toISOString());
	return {
		schema: PORTABLE_ARTIFACT_SCHEMA,
		format: 'agent-digest',
		generatedAt,
		payload: rec,
	};
}

/**
 * Structural validate for future browser/CLI open paths (pure; no FS).
 */
export function isPortableArtifact(value: unknown): value is PortableArtifact {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if (v.schema !== PORTABLE_ARTIFACT_SCHEMA) return false;
	if (v.format !== 'agent-digest') return false;
	if (typeof v.generatedAt !== 'string' || !v.generatedAt) return false;
	if (v.payload == null || typeof v.payload !== 'object') return false;
	return true;
}

/**
 * Validate + narrow; returns null when not a portable artifact.
 * Hosts may call after JSON.parse before painting.
 */
export function loadPortableArtifact(value: unknown): PortableArtifact | null {
	return isPortableArtifact(value) ? value : null;
}
