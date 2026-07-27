/**
 * Analysis-protocol P2 envelope + portable artifact helpers (pure core).
 *
 * Stamps capabilities **actually available** for this run (L0–L2 partial today),
 * completeness hints, and a wrapper schema hosts can share.
 * Never claims L3/L4 / Program this ship.
 */

import type { CodeGraph } from '@core/graph/types.ts';
import {
	expandAlias,
	parseTsconfigPaths,
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
};

/**
 * Best-effort: find tsconfig/jsconfig paths config from graph contents
 * (same candidate order as graph build pickAliasConfig).
 */
export function detectTsconfigAlias(
	contents: ReadonlyMap<string, string>,
): PathAliasConfig | null {
	const candidates = [
		'tsconfig.json',
		'jsconfig.json',
		'tsconfig.app.json',
		'tsconfig.base.json',
	];
	for (const name of candidates) {
		const exact = contents.get(name);
		if (exact) {
			const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
			const cfg = parseTsconfigPaths(exact, dir);
			if (cfg) return cfg;
		}
	}
	for (const [path, text] of contents) {
		const base = path.split('/').pop() ?? '';
		if (base === 'tsconfig.json' || base === 'jsconfig.json') {
			const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
			const cfg = parseTsconfigPaths(text, dir);
			if (cfg) return cfg;
		}
	}
	return null;
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

function mergeAliasConfig(
	tsconfig: PathAliasConfig | null,
	rewrites: readonly EnvelopeAliasRewrite[] | undefined,
): PathAliasConfig | null {
	if (!rewrites?.length) return tsconfig;
	const byPattern = new Map<string, string[]>();
	for (const p of tsconfig?.paths ?? []) {
		byPattern.set(p.pattern, [...p.targets]);
	}
	for (const r of rewrites) {
		if (!r.pattern || !r.targets?.length) continue;
		byPattern.set(r.pattern, [...r.targets]);
	}
	const paths = [...byPattern.entries()].map(([pattern, targets]) => ({
		pattern,
		targets,
	}));
	const baseUrl = tsconfig?.baseUrl ?? '';
	if (!paths.length && !baseUrl) return tsconfig;
	return { baseUrl, paths };
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
	const tsconfigCfg = detectTsconfigAlias(graph.contents);
	const hasTsconfigPaths = Boolean(tsconfigCfg?.paths.length);
	const tsconfigPresent = hasTsconfigFile(graph.contents);

	const aliases: CapabilityDetailAliases = hasRewrites
		? 'rewrite-map'
		: hasTsconfigPaths
			? 'tsconfig'
			: 'none';

	const merged = mergeAliasConfig(tsconfigCfg, rewrites);
	const l2Helped = aliasHelpedResolve(graph, merged);

	const capabilities: AnalysisCapability[] = ['L0'];
	if (graph.stats.sourceCount > 0) {
		capabilities.push('L1');
	}
	// L2 only when alias/tsconfig paths actually resolved at least one file edge
	if (l2Helped) {
		capabilities.push('L2');
	}
	// Never L3/L4 this ship

	const hasTypeOnly = graph.edges.some((e) => e.typeOnly === true);
	const exactApplied = Boolean(input.exactApplied);

	const capabilityDetail: CapabilityDetail = {
		importGraph: l2Helped ? 'resolved' : 'syntax',
		mass: exactApplied ? 'export-declaration-span' : 'whole-file',
		typeEdges: hasTypeOnly ? 'import-type-flag' : 'none',
		aliases,
	};

	const tsconfigCompleteness: AnalysisCompleteness['tsconfig'] = !tsconfigPresent
		? 'none'
		: hasTsconfigPaths
			? 'full'
			: 'partial';

	// Current hosts strip/ignore node_modules — stamp absent unless host overrides.
	const nodeModules = input.nodeModules ?? 'absent';

	const packageRoots = graph.packageJsonPaths?.length
		? graph.packageJsonPaths.length
		: graph.contents.has('package.json')
			? 1
			: 0;
	const workspaceRoots = Math.max(1, packageRoots || 1);

	const honesty = input.honesty ?? DEFAULT_ENVELOPE_HONESTY;

	return {
		protocol: ANALYSIS_PROTOCOL_ID,
		capabilities,
		capabilityDetail,
		completeness: {
			tsconfig: tsconfigCompleteness,
			nodeModules,
			workspaceRoots,
		},
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
