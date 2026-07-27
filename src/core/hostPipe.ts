/**
 * Host estimation-pipe contract (pure core).
 *
 * VS Code data pipe (and any other host) = workspace/ZIP/demo walk →
 * {@link HostFileFeed} → {@link indexHostFeed} / `indexFiles` → graph + catalog →
 * projectors / weights / inspect. Hosts produce files; core never imports `vscode`
 * or `document`.
 */

import { buildGraph } from '@core/graph/build.ts';
import { buildMapCatalog } from '@core/catalog/views.ts';
import type { CodeGraph, MapCatalog, VirtualFile } from '@core/graph/types.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
import type { LocPrecision, WeightAxis } from '@core/view/weight.ts';

/**
 * Host-produced file index. ZIP, workspace walk, demos, and session restore
 * all materialize as this shape before engine entry.
 */
export type HostFileFeed = {
	files: VirtualFile[];
};

/** Same shape as `indexFiles` result — graph SoR + map catalog. */
export type HostIndexResult = {
	graph: CodeGraph;
	catalog: MapCatalog;
};

/**
 * Optional analysis knobs for weight/inspect gates.
 * `importedSurface` is Exact-only; ignored under estimate.
 */
export type AnalysisRequest = {
	weightAxis?: WeightAxis;
	precision?: LocPrecision;
	/** Exact-only; ignored for estimate. Null/absent → Exact fails closed. */
	importedSurface?: ImportedSurfaceProvider | null;
};

/**
 * Stable engine entry: host feed → graph + catalog.
 * Semantics match `indexFiles(feed.files)` — thin named boundary for hosts.
 */
export function indexHostFeed(feed: HostFileFeed): HostIndexResult {
	const graph = buildGraph(feed.files);
	const catalog = buildMapCatalog(graph);
	return { graph, catalog };
}
