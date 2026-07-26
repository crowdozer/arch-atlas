/**
 * Public pure API for Arch Atlas Level-1 analysis.
 */

export { buildGraph, reachableFiles } from '@core/graph/build.ts';
export type {
	AlluvialFocus,
	AlluvialFocusKind,
	AlluvialNodeRef,
	AlluvialNodeRefKind,
	AlluvialPayload,
	CatalogEnd,
	CatalogStart,
	CodeGraph,
	MapCatalog,
	SuggestedView,
	VirtualFile,
} from '@core/graph/types.ts';
export { buildMapCatalog } from '@core/catalog/views.ts';
export { catalogStarts } from '@core/catalog/starts.ts';
export { catalogEnds } from '@core/catalog/ends.ts';
export { catalogHotspots } from '@core/catalog/hotspots.ts';
export { projectAlluvial } from '@core/view/alluvial.ts';
export { projectPackageImporters } from '@core/view/packageImporters.ts';
export { projectModuleFocus } from '@core/view/moduleFocus.ts';
export { extractImports } from '@core/parse/imports.ts';
export { ingestZip } from '@core/ingest/zip.ts';
export { isSourceFile, normalizePath, shouldIgnorePath } from '@core/ignore.ts';
export {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
} from '@core/tree/fileTree.ts';
export type { FileTreeNode } from '@core/tree/fileTree.ts';

import { buildGraph } from '@core/graph/build.ts';
import { buildMapCatalog } from '@core/catalog/views.ts';
import { projectAlluvial } from '@core/view/alluvial.ts';
import type { AlluvialPayload, CodeGraph, MapCatalog, VirtualFile } from '@core/graph/types.ts';

export type IndexResult = {
	graph: CodeGraph;
	catalog: MapCatalog;
};

/** Index virtual files into graph + map catalog. */
export function indexFiles(files: VirtualFile[]): IndexResult {
	const graph = buildGraph(files);
	const catalog = buildMapCatalog(graph);
	return { graph, catalog };
}

/** Convenience: catalog primary start → alluvial. */
export function alluvialForStart(
	graph: CodeGraph,
	startId: string,
): AlluvialPayload | null {
	return projectAlluvial(graph, startId);
}
