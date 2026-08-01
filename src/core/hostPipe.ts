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

import { buildGraph, type BuildGraphOpts } from '@core/graph/build.ts';
import {
	buildMapCatalog,
	type BuildMapCatalogOpts,
} from '@core/catalog/views.ts';
import type { CodeGraph, MapCatalog, VirtualFile } from '@core/graph/types.ts';

/**
 * Host-produced file index. ZIP, workspace walk, demos, and session restore
 * all materialize as this shape before engine entry.
 */
export type HostFileFeed = {
	files: VirtualFile[];
};

/** Graph SoR + map catalog - single result shape for host feed and `indexFiles`. */
export type IndexResult = {
	graph: CodeGraph;
	catalog: MapCatalog;
};

export type IndexHostFeedOpts = {
	/** Forwarded to {@link buildMapCatalog} (UI omits → default top-N). */
	catalog?: BuildMapCatalogOpts;
	/**
	 * When set, unresolved relative/alias targets that match are stamped
	 * `toKind: 'omitted'` instead of `unresolved`.
	 */
	isOmittedPath?: BuildGraphOpts['isOmittedPath'];
	/**
	 * Extra path aliases (CLI `--alias`) merged after tsconfig pick.
	 * Same pattern: rewrite wins.
	 */
	extraAliases?: BuildGraphOpts['extraAliases'];
};

/**
 * Stable engine entry: host feed → graph + catalog.
 * Single owner of the index path; `indexFiles(files)` delegates here.
 */
export function indexHostFeed(feed: HostFileFeed, opts?: IndexHostFeedOpts): IndexResult {
	const graph = buildGraph(feed.files, {
		isOmittedPath: opts?.isOmittedPath,
		extraAliases: opts?.extraAliases,
	});
	const catalog = buildMapCatalog(graph, opts?.catalog);
	return { graph, catalog };
}
