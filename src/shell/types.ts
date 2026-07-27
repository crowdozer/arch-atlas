/**
 * Shared shell types (host-agnostic session + interaction mode).
 * Web host may close over additional DOM-only state outside this type.
 */
import type { CodeGraph, MapCatalog } from '@core/graph/types.ts';

/** Click behavior: drill navigates; inspect opens import evidence. */
export type InteractionMode = 'drill' | 'inspect';

/**
 * Active workspace session after index/restore.
 * `expanded` is UI tree fold state (web host today; portable as string paths).
 * `startId` is **derived** from the nav stack nearest file-hub — not a parallel
 * navigation owner (see app commitNavigation / shell atlasView helpers).
 */
export type Session = {
	graph: CodeGraph;
	catalog: MapCatalog;
	startId: string | null;
	warnings: string[];
	/** Dir paths currently expanded in the tree. */
	expanded: Set<string>;
};
