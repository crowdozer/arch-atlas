/**
 * Public pure API for Arch Atlas Level-1 analysis.
 */

export { buildGraph, classifyUnresolvedReason, reachableFiles } from '@core/graph/build.ts';
export type { BuildGraphOpts } from '@core/graph/build.ts';
export type {
	AlluvialFocus,
	AlluvialFocusKind,
	AlluvialNodeRef,
	AlluvialNodeRefKind,
	AlluvialPayload,
	CatalogBlast,
	CatalogBoundaryCrossing,
	CatalogComplex,
	CatalogDeep,
	CatalogEnd,
	CatalogFileLoc,
	CatalogHotspot,
	CatalogIceberg,
	CatalogPublicMass,
	CatalogScc,
	CatalogSpine,
	CatalogStart,
	CodeGraph,
	FileParseKind,
	InferredFileRole,
	MapCatalog,
	ParseMapEntry,
	SpineFormula,
	UnresolvedReason,
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
export type { BuildMapCatalogOpts } from '@core/catalog/views.ts';
export { catalogStarts, catalogStartsSplit } from '@core/catalog/starts.ts';
export type { CatalogStartsResult } from '@core/catalog/starts.ts';
export { catalogEnds } from '@core/catalog/ends.ts';
export { catalogHotspots } from '@core/catalog/hotspots.ts';
export type { CatalogHotspotsOpts } from '@core/catalog/hotspots.ts';
export {
	HOTSPOT_SURFACE_DEMOTION,
	inferFileRoles,
	isBarrelBasename,
	isDebugPath,
	isFacade,
	isFacadeBasename,
	isHotspotDemotedSurface,
	isPureBarrel,
	primaryRole,
} from '@core/catalog/roles.ts';
export { catalogCycles, stronglyConnectedComponents } from '@core/catalog/cycles.ts';
export type { CatalogCyclesResult } from '@core/catalog/cycles.ts';
export { catalogBoundaryCrossings } from '@core/catalog/boundary.ts';
export { catalogFileLoc } from '@core/catalog/fileLoc.ts';
export { catalogBlastRadius } from '@core/catalog/blastRadius.ts';
export {
	DEFAULT_SPINE_FORMULA,
	SPINE_FORMULAS,
	catalogSpines,
	rankSpineRows,
	spineMetrics,
} from '@core/catalog/spines.ts';
export {
	ICEBERG_MAX_RATIO,
	MIN_PRIVATE,
	MIN_WHOLE,
	PUBLIC_MIN_RATIO,
	buildMassBins,
} from '@core/catalog/massBins.ts';
export type { MassBinDefaults, MassBinsResult } from '@core/catalog/massBins.ts';
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
	hubReverseEdgeWeight,
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
export {
	edgeMatchesPackage,
	primaryImporterFile,
} from '@core/view/packageImporters.ts';
export { projectModuleFocus } from '@core/view/moduleFocus.ts';
export {
	fileDegreeMaps,
	fileInDegree,
	fileOutDegree,
	fileUniqueInDegree,
	fileUniqueOutDegree,
	preferFileImportersView,
	projectFileImporters,
} from '@core/view/fileImporters.ts';
export type { DegreeOpts } from '@core/view/fileImporters.ts';
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
export {
	extractPythonImports,
	stripPythonNoise,
} from '@core/parse/pythonImports.ts';
export {
	extractAstroImports,
	extractAstroScriptIslands,
	extractAstroScriptText,
} from '@core/parse/astroImports.ts';
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
export {
	expandAlias,
	joinPosix,
	mergePathAliases,
	parseAliasFlag,
	parseTsconfigPaths,
	pickAliasConfig,
} from '@core/parse/tsconfig.ts';
export type { PathAliasConfig } from '@core/parse/tsconfig.ts';
export { ingestZip, isTextPath } from '@core/ingest/zip.ts';
export {
	filterFilesByTestInclusion,
	isAstroSourceFile,
	isPythonSourceFile,
	isSourceFile,
	isTestPath,
	normalizePath,
	shouldIgnorePath,
} from '@core/ignore.ts';
export {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
} from '@core/tree/fileTree.ts';
export type { FileTreeNode } from '@core/tree/fileTree.ts';
export { indexHostFeed } from '@core/hostPipe.ts';
export type { HostFileFeed, IndexHostFeedOpts, IndexResult } from '@core/hostPipe.ts';
export {
	AGENT_DIGEST_SCHEMA,
	AGENT_FILE_SCHEMA,
	AGENT_TREE_SCHEMA,
	ANALYSIS_HONESTY,
	ANALYSIS_HONESTY_EXACT,
	ANALYSIS_HONESTY_FILE,
	FILE_LENS_CAPABILITIES,
	SURFACE_METRIC_NOTE,
	buildAgentDigest,
	buildAgentFileReport,
	buildAgentTree,
	fileLocFromExportSurface,
} from '@core/export/agentDigest.ts';
export type {
	AgentAliasRewrite,
	AgentDigest,
	AgentDigestAnalysis,
	AgentDigestScope,
	AgentDigestSource,
	AgentExactSurfaceInput,
	AgentFileAnalysis,
	AgentFileLensCapabilities,
	AgentFileReport,
	AgentScopePreset,
	AgentTreeAnalysis,
	AgentTreeNode,
	AgentTreeOut,
	BuildAgentDigestInput,
} from '@core/export/agentDigest.ts';
export {
	ANALYSIS_PROTOCOL_ID,
	PORTABLE_ARTIFACT_SCHEMA,
	aliasHelpedResolve,
	buildAnalysisEnvelope,
	detectTsconfigAlias,
	envelopeFields,
	isPortableArtifact,
	loadPortableArtifact,
	toPortableArtifact,
} from '@core/export/analysisEnvelope.ts';
export type {
	AnalysisCapability,
	AnalysisCompleteness,
	AnalysisEnvelope,
	AnalysisEnvelopeFields,
	BuildAnalysisEnvelopeInput,
	CapabilityDetail,
	CapabilityDetailAliases,
	CapabilityDetailImportGraph,
	CapabilityDetailMass,
	CapabilityDetailTypeEdges,
	EnvelopeAliasRewrite,
	PortableArtifact,
	PortableArtifactFormat,
} from '@core/export/analysisEnvelope.ts';
export {
	AGENT_IMPACT_SCHEMA,
	ANALYSIS_HONESTY_IMPACT,
	blastMetricsForGraph,
	buildAgentImpact,
	impactEdgeKey,
} from '@core/export/agentImpact.ts';
export type {
	AgentImpact,
	AgentImpactBlastMover,
	AgentImpactDegreeMover,
	AgentImpactSummaryCounts,
	BuildAgentImpactInput,
} from '@core/export/agentImpact.ts';

import {
	indexHostFeed,
	type IndexHostFeedOpts,
	type IndexResult,
} from '@core/hostPipe.ts';
import { projectAlluvial } from '@core/view/alluvial.ts';
import type { WeightAxis } from '@core/view/weight.ts';
import type { AlluvialPayload, CodeGraph, VirtualFile } from '@core/graph/types.ts';

/** Index virtual files into graph + map catalog (thin alias of indexHostFeed). */
export function indexFiles(files: VirtualFile[], opts?: IndexHostFeedOpts): IndexResult {
	return indexHostFeed({ files }, opts);
}

/** Convenience: catalog primary start → alluvial. */
export function alluvialForStart(
	graph: CodeGraph,
	startId: string,
	opts?: { weightAxis?: WeightAxis },
): AlluvialPayload | null {
	return projectAlluvial(graph, startId, opts);
}
