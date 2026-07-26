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
	CatalogComplex,
	CatalogDeep,
	CatalogEnd,
	CatalogHotspot,
	CatalogStart,
	CodeGraph,
	FileParseKind,
	MapCatalog,
	ParseMapEntry,
	SuggestedView,
	VirtualFile,
} from '@core/graph/types.ts';
export {
	buildParseMap,
	classifyFileParse,
	importParseablePaths,
	shouldKeepInGraph,
} from '@core/parse/capability.ts';
export type { FileParseInfo } from '@core/parse/capability.ts';
export { buildMapCatalog } from '@core/catalog/views.ts';
export { catalogStarts } from '@core/catalog/starts.ts';
export { catalogEnds } from '@core/catalog/ends.ts';
export { catalogHotspots } from '@core/catalog/hotspots.ts';
export {
	catalogComplex,
	catalogDeepest,
	fileDistances,
	importDepthStats,
} from '@core/catalog/deepest.ts';
export { projectAlluvial } from '@core/view/alluvial.ts';
export type { LocPrecision, WeightAxis, WeightResolution } from '@core/view/weight.ts';
export {
	EXACT_NOT_IMPLEMENTED_MESSAGE,
	axisNeedsImportedSurface,
	edgeWeight,
	fileLineCount,
	lineCount,
	resolveLocPrecision,
	resolveWeightRequest,
	unitsForAxis,
} from '@core/view/weight.ts';
export { projectPackageImporters } from '@core/view/packageImporters.ts';
export { projectModuleFocus } from '@core/view/moduleFocus.ts';
export {
	fileInDegree,
	fileOutDegree,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
export { projectMultiHopAlluvial, stageForDepth } from '@core/view/multiHop.ts';
export {
	callSitesForEdge,
	edgesForBand,
	edgesForNode,
	evidenceForEdges,
	importedCodeForEdge,
	snippetsForEdges,
} from '@core/view/inspect.ts';
export type {
	CallSiteSnippet,
	EvidenceBlocker,
	ImportEvidence,
	ImportSnippet,
	ImportedCodeSnippet,
} from '@core/view/inspect.ts';
export {
	extractImports,
	localNamesFromBindings,
	parseImportClause,
} from '@core/parse/imports.ts';
export type { ImportBinding } from '@core/graph/types.ts';
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
import type { WeightAxis } from '@core/view/weight.ts';
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
	opts?: { weightAxis?: WeightAxis },
): AlluvialPayload | null {
	return projectAlluvial(graph, startId, opts);
}
