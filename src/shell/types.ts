/**
 * Shared shell types (host-agnostic session + interaction mode).
 * Web host may close over additional DOM-only state outside this type.
 */
import type { CodeGraph, MapCatalog, VirtualFile } from '@core/graph/types.ts';

/** Click behavior: drill navigates; inspect opens import evidence. */
export type InteractionMode = 'drill' | 'inspect';

/**
 * Browser Program enrich stamps (topology L2 / thin L3). Not Exact mass.
 * Optional session field after Precision → Program succeeds.
 */
export type SessionProgramMeta = {
	resolvedCount: number;
	resolvedAliasCount: number;
	thinL3: boolean;
	exportSymbolCount: Map<string, number>;
	tsconfig: 'none' | 'partial' | 'full';
	missingLibs: string[];
	rootFileCount: number;
};

/**
 * Active workspace session after index/restore.
 * `expanded` is UI tree fold state (web host today; portable as string paths).
 * `startId` is **derived** from the nav stack nearest file-hub — not a parallel
 * navigation owner (see app commitNavigation / shell atlasView helpers).
 * `files` is the full host feed (pre test-filter) for re-index when inclusion toggles.
 */
export type Session = {
	graph: CodeGraph;
	catalog: MapCatalog;
	startId: string | null;
	warnings: string[];
	/** Dir paths currently expanded in the tree. */
	expanded: Set<string>;
	/**
	 * Full VirtualFile feed from ZIP/demo/restore (includes tests even when the
	 * graph currently excludes them). CLI hosts need not populate this.
	 */
	files: VirtualFile[];
	/**
	 * Last successful Program (createProgram) enrich stamps for this graph.
	 * Cleared on new open / reindex; not persisted.
	 */
	programMeta?: SessionProgramMeta;
};
