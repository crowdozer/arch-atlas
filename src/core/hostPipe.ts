/**
 * Host estimation-pipe contract (pure core).
 *
 * VS Code data pipe (and any other host) = workspace/ZIP/demo walk →
 * {@link HostFileFeed} → {@link indexHostFeed} / `indexFiles` → graph + catalog →
 * projectors / weights / inspect. Hosts produce files; core never imports `vscode`
 * or `document`.
 *
 * `indexHostFeed` owns the index body; `indexFiles` is a thin alias over it.
 */

import { buildGraph } from '@core/graph/build.ts';
import { buildMapCatalog } from '@core/catalog/views.ts';
import type { CodeGraph, MapCatalog, VirtualFile } from '@core/graph/types.ts';

/**
 * Host-produced file index. ZIP, workspace walk, demos, and session restore
 * all materialize as this shape before engine entry.
 */
export type HostFileFeed = {
	files: VirtualFile[];
};

/** Graph SoR + map catalog — single result shape for host feed and `indexFiles`. */
export type IndexResult = {
	graph: CodeGraph;
	catalog: MapCatalog;
};

/**
 * Stable engine entry: host feed → graph + catalog.
 * Single owner of the index path; `indexFiles(files)` delegates here.
 */
export function indexHostFeed(feed: HostFileFeed): IndexResult {
	const graph = buildGraph(feed.files);
	const catalog = buildMapCatalog(graph);
	return { graph, catalog };
}
