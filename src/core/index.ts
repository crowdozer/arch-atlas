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
	CatalogBlast,
	CatalogComplex,
	CatalogDeep,
	CatalogEnd,
	CatalogFileLoc,
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
export { catalogFileLoc } from '@core/catalog/fileLoc.ts';
export { catalogBlastRadius } from '@core/catalog/blastRadius.ts';
export {
	catalogComplex,
	catalogDeepest,
	fileDistances,
	importDepthStats,
} from '@core/catalog/deepest.ts';
export { projectAlluvial } from '@core/view/alluvial.ts';
export type {
	EdgeWeightOpts,
	LocPrecision,
	WeightAxis,
	WeightResolution,
} from '@core/view/weight.ts';
export {
	EXACT_NOT_IMPLEMENTED_MESSAGE,
	EXACT_SURFACE_UNRESOLVED_MESSAGE,
	IMPORTED_SURFACE_LOC_MESSAGE,
	IMPORTED_SURFACE_LOC_UI,
	axisNeedsImportedSurface,
	edgeWeight,
	fileLineCount,
	lineCount,
	normalizeExactSurfaceMass,
	pickEdgeWeightOpts,
	resolveLocPrecision,
	resolveWeightRequest,
	unitsForAxis,
} from '@core/view/weight.ts';
export type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
export type {
	EngineId,
	MissingLanguageEngine,
	RequiredEnginesResult,
} from '@core/exact/engineMap.ts';
export {
	graphNeedsTypescript,
	requiredEngines,
} from '@core/exact/engineMap.ts';
export { projectPackageImporters } from '@core/view/packageImporters.ts';
export { projectModuleFocus } from '@core/view/moduleFocus.ts';
export {
	fileInDegree,
	fileOutDegree,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
export {
	HUB_DEFAULT_MAX_DEPTH,
	NORMAL_DEFAULT_MAX_DEPTH,
	preferFileHubView,
	projectFileHub,
} from '@core/view/fileHub.ts';
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
export {
	CANDIDATE_LANGUAGE_NOTES,
	RULES_BY_FAMILY,
	familyForPath,
	familyHasRule,
} from '@core/parse/resolveRules.ts';
export type {
	CandidateLanguageNote,
	LanguageFamilyId,
	PathRuleFamily,
} from '@core/parse/resolveRules.ts';
export { resolveSpecifier, barePackageName, isRelativeSpecifier } from '@core/parse/resolve.ts';
export type { ResolveResult } from '@core/parse/resolve.ts';
export { ingestZip } from '@core/ingest/zip.ts';
export { isSourceFile, normalizePath, shouldIgnorePath } from '@core/ignore.ts';
export {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
} from '@core/tree/fileTree.ts';
export type { FileTreeNode } from '@core/tree/fileTree.ts';
export { indexHostFeed } from '@core/hostPipe.ts';
export type { HostFileFeed, IndexResult } from '@core/hostPipe.ts';

import { indexHostFeed, type IndexResult } from '@core/hostPipe.ts';
import { projectAlluvial } from '@core/view/alluvial.ts';
import type { WeightAxis } from '@core/view/weight.ts';
import type { AlluvialPayload, CodeGraph, VirtualFile } from '@core/graph/types.ts';

/** Index virtual files into graph + map catalog (thin alias of indexHostFeed). */
export function indexFiles(files: VirtualFile[]): IndexResult {
	return indexHostFeed({ files });
}

/** Convenience: catalog primary start → alluvial. */
export function alluvialForStart(
	graph: CodeGraph,
	startId: string,
	opts?: { weightAxis?: WeightAxis },
): AlluvialPayload | null {
	return projectAlluvial(graph, startId, opts);
}
