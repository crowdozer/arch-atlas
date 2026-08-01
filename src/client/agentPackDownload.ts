/**
 * Web host: assemble CLI-parity agent digest from the open session and
 * download as bare `arch-atlas.agent-digest.v1` JSON (no portable wrapper).
 *
 * Pure assembly stays free of DOM; {@link downloadAgentPackDigest} is the
 * thin browser trigger. Exact/Program stamps only when callers pass live
 * session chrome inputs (web is estimate-first — do not force Exact).
 */

import {
	buildAgentDigest,
	type AgentDigest,
	type AgentExactSurfaceInput,
	type AgentProgramInput,
	type CodeGraph,
	type MapCatalog,
} from '@core/index.ts';
import type { SessionProgramMeta } from '@shell/index.ts';
import { downloadJson } from './downloadJson.ts';

/** Best-effort feed identity for digest `source` (host-owned; not Session schema). */
export type AgentPackSourceLabel = {
	kind: 'directory' | 'zip';
	path: string;
};

/** Fallback when open path did not set a label (restore / unknown). */
export const DEFAULT_AGENT_PACK_SOURCE: AgentPackSourceLabel = {
	kind: 'zip',
	path: 'browser-session',
};

/** Map web Program stamps → digest program input. */
export function programMetaToAgentInput(
	meta: SessionProgramMeta | undefined,
): AgentProgramInput | undefined {
	if (!meta) return undefined;
	return {
		applied: true,
		thinL3: meta.thinL3,
		exportSymbolCount: meta.exportSymbolCount,
		tsconfig: meta.tsconfig,
		missingLibs: meta.missingLibs,
		resolvedCount: meta.resolvedCount,
		resolvedAliasCount: meta.resolvedAliasCount,
	};
}

export type BuildAgentPackInput = {
	graph: CodeGraph;
	catalog: MapCatalog;
	source: AgentPackSourceLabel;
	warnings?: string[];
	includeTests: boolean;
	/**
	 * Live Exact mass only. Omit when chrome is Estimate or Exact is not ready
	 * (honesty: do not invent export-surface rankings).
	 */
	exact?: AgentExactSurfaceInput;
	programMeta?: SessionProgramMeta;
	/**
	 * Host requested Exact/Program chrome (dropdown), even if mass not applied.
	 * Defaults to `Boolean(exact)`.
	 */
	exactRequested?: boolean;
	/** Override clock for tests. */
	generatedAt?: string;
};

/**
 * Project session graph/catalog into bare agent digest (same builder as CLI digest).
 * Never includes `contents` or raw source text.
 */
export function buildAgentPackDigest(input: BuildAgentPackInput): AgentDigest {
	const exactApplied = Boolean(input.exact);
	const exactRequested = input.exactRequested ?? exactApplied;
	return buildAgentDigest({
		graph: input.graph,
		catalog: input.catalog,
		source: input.source,
		warnings: input.warnings,
		exact: input.exact,
		program: programMetaToAgentInput(input.programMeta),
		scope: {
			omit: [],
			includeTests: input.includeTests,
			exactRequested,
			exactApplied,
			feedKind: input.source.kind,
		},
		generatedAt: input.generatedAt,
	});
}

/** Safe download filename from source path / demo label. */
export function agentPackFilename(sourcePath: string): string {
	const leaf =
		sourcePath
			.replace(/\.zip$/i, '')
			.split(/[/\\]/)
			.filter(Boolean)
			.pop() ?? sourcePath;
	const safe =
		leaf.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
		'arch-atlas';
	return `${safe}-agent-digest.json`;
}

/** Browser download of a built digest (pretty JSON). */
export function downloadAgentPackDigest(
	digest: AgentDigest,
	filename?: string,
): void {
	downloadJson(filename ?? agentPackFilename(digest.source.path), digest);
}
