/**
 * Pure agent-facing projections over CodeGraph + MapCatalog.
 * No FS / process — hosts (CLI, future injectors) call these after indexHostFeed.
 */

import { buildMassBins } from '@core/catalog/massBins.ts';
import { DEFAULT_SPINE_FORMULA } from '@core/catalog/spines.ts';
import type {
	CatalogBlast,
	CatalogComplex,
	CatalogDeep,
	CatalogEnd,
	CatalogFileLoc,
	CatalogHotspot,
	CatalogIceberg,
	CatalogPublicMass,
	CatalogSpine,
	CatalogStart,
	CodeGraph,
	MapCatalog,
	SpineFormula,
} from '@core/graph/types.ts';
import {
	buildFileTree,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
import {
	fileInDegree,
	fileOutDegree,
	fileUniqueInDegree,
	fileUniqueOutDegree,
} from '@core/view/fileImporters.ts';

export const AGENT_DIGEST_SCHEMA = 'arch-atlas.agent-digest.v1' as const;
export const AGENT_TREE_SCHEMA = 'arch-atlas.agent-tree.v1' as const;
export const AGENT_FILE_SCHEMA = 'arch-atlas.agent-file.v1' as const;

export const ANALYSIS_HONESTY =
	'Level-1 static import graph (JS/TS + Python); not LSP / not tree-shake';

/** Exact (export surface) honesty — same product contract as web Precision Exact. */
export const ANALYSIS_HONESTY_EXACT =
	'Level-1 import graph + export-declaration surface LOC for JS/TS (classic TS AST or text fallback); surfaceLoc / exportDeclarationLoc = export-declaration span coverage (not public-API member surface); Python/Astro stay estimate mass (surfaceSupport unsupported — never 0-surface icebergs); not LSP / not bundler tree-shake';

/** Note folded into analysis when Exact mass bins are present. */
export const SURFACE_METRIC_NOTE =
	'surfaceLoc and exportDeclarationLoc count lines covered by export declarations (span coverage), not public API surface area';

export type AgentDigestSource = {
	kind: 'directory' | 'zip';
	/** Absolute or user-supplied path string (host-owned; not resolved by core). */
	path: string;
};

export type AgentDigestScope = {
	/** Normalized omit globs applied at feed (may be empty). */
	omit: string[];
	/** Whether tests were included (CLI default true). */
	includeTests: boolean;
	/** Host requested Exact mass overlay. */
	exactRequested: boolean;
	/** Exact overlay actually applied. */
	exactApplied: boolean;
	/** Feed origin kind. */
	feedKind: 'directory' | 'zip' | string;
};

export type AgentDigestGraphFile = {
	path: string;
	isSource: boolean;
	/** Best-effort language tag from extension (source files only). */
	language?: string;
};

export type AgentDigestGraphPackage = {
	id: string;
	name: string;
};

export type AgentDigestGraphEdge = {
	from: string;
	to: string;
	toKind: 'file' | 'package' | 'unresolved' | 'omitted';
	form: 'import' | 'export' | 'require' | 'dynamic';
	line: number;
	/** Present when true (import type / export type from). */
	typeOnly?: boolean;
};

export type AgentDigestCatalog = {
	starts: CatalogStart[];
	/** Declared-ish entrypoints (additive split). */
	entrypoints?: CatalogStart[];
	/** Orphan roots (additive split). */
	roots?: CatalogStart[];
	ends: CatalogEnd[];
	hotspots: CatalogHotspot[];
	/** Downwind import reach ranking (wire name kept for compat). */
	complex: CatalogComplex[];
	/**
	 * Honesty alias of complex — downwind import reach (not cyclomatic complexity).
	 */
	downwindReach: CatalogComplex[];
	deepest: CatalogDeep[];
	fileLoc: CatalogFileLoc[];
	/** Reverse-reach consumers ranking (wire name kept for compat). */
	blastRadius: CatalogBlast[];
	/**
	 * Honesty alias of blastRadius — reverse-reach file count (cycle-sensitive).
	 */
	reverseReach: CatalogBlast[];
	/** Public-mass files (Exact surface ratio); empty under estimate. */
	publicMass: CatalogPublicMass[];
	/** Iceberg files (Exact private mass); empty under estimate. */
	icebergs: CatalogIceberg[];
	/** Cross-cutting spines (topology). */
	spines: CatalogSpine[];
};

export type AgentDigestAnalysis = {
	tier: 'estimate' | 'exact';
	honesty: string;
	/** How fileLoc.loc was measured. */
	locMetric: 'whole-file' | 'export-surface';
	/** surfaceLoc / exportDeclarationLoc honesty when Exact. */
	surfaceMetricNote?: string;
	/** Spine ranking formula used for catalog.spines. */
	spineFormula?: SpineFormula;
	/** Exact engine origin when tier is exact. */
	engine?: {
		source: 'inject' | 'local' | 'jsdelivr' | 'unpkg';
		/** True when classic createSourceFile AST was used for spans. */
		classicAst?: boolean;
	};
};

export type AgentDigestSummary = MapCatalog['summary'] & {
	/** External packages only (alias of packageCount). */
	externalPackageCount?: number;
};

export type AgentDigest = {
	schema: typeof AGENT_DIGEST_SCHEMA;
	generatedAt: string;
	source: AgentDigestSource;
	analysis: AgentDigestAnalysis;
	/** Scope stamp for agent honesty (omit, Exact, feed). */
	scope?: AgentDigestScope;
	summary: AgentDigestSummary;
	warnings: string[];
	catalog: AgentDigestCatalog;
	/**
	 * When exact: whole-file LOC ranking retained for comparison
	 * (fileLoc uses export-surface LOC).
	 */
	catalogEstimateFileLoc?: CatalogFileLoc[];
	graph: {
		files: AgentDigestGraphFile[];
		packages: AgentDigestGraphPackage[];
		edges: AgentDigestGraphEdge[];
	};
};

export type AgentExactSurfaceInput = {
	engineSource: 'inject' | 'local' | 'jsdelivr' | 'unpkg';
	classicAst?: boolean;
	/** path → unique lines covered by export decls */
	exportSurfaceLoc: ReadonlyMap<string, number>;
};

export type BuildAgentDigestInput = {
	graph: CodeGraph;
	catalog: MapCatalog;
	source: AgentDigestSource;
	/** Ingest / host warnings (depth skips, zip size, etc.). */
	warnings?: string[];
	/** Override clock for tests. */
	generatedAt?: string;
	/**
	 * When set, digest uses Exact honesty and re-ranks fileLoc by export-surface
	 * LOC (graph topology / other bins unchanged — Exact is not a re-index).
	 */
	exact?: AgentExactSurfaceInput;
	/** Optional scope stamp (CLI omit / Exact flags). */
	scope?: Partial<AgentDigestScope>;
};

export type AgentTreeNode = {
	name: string;
	path: string;
	kind: 'dir' | 'file';
	/** Dir children (summary may omit deep leaves). */
	children?: AgentTreeNode[];
	isSource?: boolean;
	unparseable?: boolean;
	parseNote?: string;
	/** Dir: descendant file count. */
	fileCount?: number;
	/** Dir: descendant import-parseable count. */
	sourceCount?: number;
	/** Dir: rolled edge counts (optional). */
	edgeIn?: number;
	edgeOut?: number;
};

export type AgentTreeOut = {
	schema: typeof AGENT_TREE_SCHEMA;
	generatedAt: string;
	source: AgentDigestSource;
	warnings: string[];
	/** full = verbose file leaves; summary = directory rolls. */
	mode?: 'full' | 'summary';
	tree: AgentTreeNode | FileTreeNode;
};

export type AgentFileNeighbor = {
	path: string;
	/** Package label when toKind is package/unresolved/omitted. */
	label?: string;
	toKind: 'file' | 'package' | 'unresolved' | 'omitted';
	form: 'import' | 'export' | 'require' | 'dynamic';
	line: number;
	typeOnly?: boolean;
};

export type AgentFileImporter = {
	path: string;
	form: 'import' | 'export' | 'require' | 'dynamic';
	line: number;
	typeOnly?: boolean;
};

export type AgentFileCatalogHits = {
	starts?: CatalogStart;
	hotspots?: CatalogHotspot;
	complex?: CatalogComplex;
	/** Honesty alias of complex when present. */
	downwindReach?: CatalogComplex;
	deepest?: CatalogDeep;
	fileLoc?: CatalogFileLoc;
	blastRadius?: CatalogBlast;
	/** Honesty alias of blastRadius when present. */
	reverseReach?: CatalogBlast;
	publicMass?: CatalogPublicMass;
	icebergs?: CatalogIceberg;
	spines?: CatalogSpine;
};

/**
 * File-lens capability stamp — topology neighbors + catalog hits only.
 * Exact mass is not available on the `file` command.
 */
export type AgentFileLensCapabilities = {
	/** Exact / export-surface mass not on file command. */
	mass: false;
	neighbors: true;
	catalogHits: true;
	/** Level-1 syntax import graph (not Program / not LSP). */
	importGraph: 'syntax';
};

export type AgentFileAnalysis = {
	/** Capability matrix for this lens. */
	fileLens: AgentFileLensCapabilities;
	honesty: string;
};

export type AgentFileReport = {
	schema: typeof AGENT_FILE_SCHEMA;
	generatedAt: string;
	source: AgentDigestSource;
	path: string;
	exists: boolean;
	isSource?: boolean;
	parseNote?: string;
	outDegree?: number;
	inDegree?: number;
	uniqueOut?: number;
	uniqueIn?: number;
	scope?: AgentDigestScope;
	/** File-lens capability stamp (mass not available on file command). */
	analysis?: AgentFileAnalysis;
	catalogHits?: AgentFileCatalogHits;
	/** Outgoing import edges (structural; no source text). */
	imports?: AgentFileNeighbor[];
	/** Incoming file→file import edges. */
	importers?: AgentFileImporter[];
	/** Total outgoing edges before truncation. */
	importsTotal?: number;
	/** Total incoming edges before truncation. */
	importersTotal?: number;
	/** Length of imports array after cap (shown count). */
	importsShown?: number;
	/** Length of importers array after cap (shown count). */
	importersShown?: number;
	/** True when imports or importers were capped. */
	truncated?: boolean;
	warnings: string[];
};

/** File-command honesty: topology only; Exact mass not on this lens. */
export const ANALYSIS_HONESTY_FILE =
	'Level-1 syntax import neighbors + catalog hits; Exact mass not available on file command; not LSP / not tree-shake';

export const FILE_LENS_CAPABILITIES: AgentFileLensCapabilities = {
	mass: false,
	neighbors: true,
	catalogHits: true,
	importGraph: 'syntax',
};

function languageForPath(path: string, isSource: boolean): string | undefined {
	if (!isSource) return undefined;
	if (/\.tsx?$/i.test(path)) return 'TypeScript';
	if (/\.jsx?$/i.test(path) || /\.mjs$/i.test(path) || /\.cjs$/i.test(path)) {
		return 'JavaScript';
	}
	if (/\.py$/i.test(path)) return 'Python';
	if (/\.astro$/i.test(path)) return 'Astro';
	return undefined;
}

function resolveScope(
	source: AgentDigestSource,
	partial: Partial<AgentDigestScope> | undefined,
	exactApplied: boolean,
): AgentDigestScope {
	return {
		omit: partial?.omit ?? [],
		includeTests: partial?.includeTests ?? true,
		exactRequested: partial?.exactRequested ?? false,
		exactApplied,
		feedKind: partial?.feedKind ?? source.kind,
	};
}

/**
 * Re-rank catalog fileLoc rows using export-surface LOC (Exact).
 * Preserves degree fields from the estimate rows when present.
 */
export function fileLocFromExportSurface(
	graph: CodeGraph,
	exportSurfaceLoc: ReadonlyMap<string, number>,
	limit: number,
	estimateRows?: readonly CatalogFileLoc[],
): CatalogFileLoc[] {
	const byPath = new Map(estimateRows?.map((r) => [r.path, r]) ?? []);
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	if (!estimateRows?.length) {
		for (const e of graph.edges) {
			outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
			if (e.toKind === 'file') {
				inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
			}
		}
	}

	const rows: CatalogFileLoc[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const loc = exportSurfaceLoc.get(path) ?? 0;
		if (loc <= 0) continue;
		const est = byPath.get(path);
		rows.push({
			id: path,
			path,
			loc,
			// Dual-publish Exact surface names alongside loc
			exportDeclarationLoc: loc,
			surfaceLoc: loc,
			outDegree: est?.outDegree ?? outDeg.get(path) ?? 0,
			inDegree: est?.inDegree ?? inDeg.get(path) ?? 0,
			epistemic: 'observed',
		});
	}
	rows.sort((a, b) => b.loc - a.loc || a.path.localeCompare(b.path));
	return rows.slice(0, Math.max(0, limit));
}

/**
 * Project graph + catalog into a JSON-safe agent digest.
 * Never includes `contents` or raw source text.
 */
export function buildAgentDigest(input: BuildAgentDigestInput): AgentDigest {
	const { graph, catalog, source } = input;
	const warnings = [...(input.warnings ?? [])];
	const generatedAt = input.generatedAt ?? new Date().toISOString();

	const files: AgentDigestGraphFile[] = [...graph.files.values()]
		.map((f) => ({
			path: f.path,
			isSource: f.isSource,
			language: languageForPath(f.path, f.isSource),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));

	const packages: AgentDigestGraphPackage[] = [...graph.packages.values()]
		.map((p) => ({ id: p.id, name: p.name }))
		.sort((a, b) => a.id.localeCompare(b.id));

	const edges: AgentDigestGraphEdge[] = graph.edges.map((e) => ({
		from: e.from,
		to: e.to,
		toKind: e.toKind,
		form: e.form,
		line: e.line,
		...(e.typeOnly ? { typeOnly: true } : {}),
	}));

	if (graph.stats.sourceCount === 0) {
		warnings.push('Empty graph: no import-parseable source files in feed.');
	}

	const exact = input.exact;
	let fileLoc = catalog.fileLoc;
	let catalogEstimateFileLoc: CatalogFileLoc[] | undefined;
	let publicMass = catalog.publicMass ?? [];
	let icebergs = catalog.icebergs ?? [];
	const spines = catalog.spines ?? [];
	const spineFormula =
		catalog.spineFormula ?? DEFAULT_SPINE_FORMULA;
	let analysis: AgentDigestAnalysis = {
		tier: 'estimate',
		honesty: ANALYSIS_HONESTY,
		locMetric: 'whole-file',
		spineFormula,
	};

	if (exact) {
		const limit = Math.max(catalog.fileLoc.length, 40);
		catalogEstimateFileLoc = catalog.fileLoc.map((r) => ({ ...r }));
		fileLoc = fileLocFromExportSurface(
			graph,
			exact.exportSurfaceLoc,
			limit,
			catalog.fileLoc,
		);
		const mass = buildMassBins(graph, exact.exportSurfaceLoc, limit);
		publicMass = mass.publicMass;
		icebergs = mass.icebergs;
		analysis = {
			tier: 'exact',
			honesty: ANALYSIS_HONESTY_EXACT,
			locMetric: 'export-surface',
			surfaceMetricNote: SURFACE_METRIC_NOTE,
			spineFormula,
			engine: {
				source: exact.engineSource,
				classicAst: exact.classicAst,
			},
		};
		warnings.push(
			`Exact export-surface LOC via engine source=${exact.engineSource}` +
				(exact.classicAst ? ' (classic AST)' : ' (text fallback spans)'),
		);
	}

	const scope = resolveScope(source, input.scope, Boolean(exact));

	const summary: AgentDigestSummary = {
		...catalog.summary,
		externalPackageCount:
			catalog.summary.externalPackageCount ?? catalog.summary.packageCount,
	};

	const complex = catalog.complex;
	const blastRadius = catalog.blastRadius;

	return {
		schema: AGENT_DIGEST_SCHEMA,
		generatedAt,
		source,
		analysis,
		scope,
		summary,
		warnings,
		catalog: {
			starts: catalog.starts,
			entrypoints: catalog.entrypoints,
			roots: catalog.roots,
			ends: catalog.ends,
			hotspots: catalog.hotspots,
			complex,
			// Honesty aliases (same arrays; agents may prefer clearer names)
			downwindReach: complex,
			deepest: catalog.deepest,
			fileLoc,
			blastRadius,
			reverseReach: blastRadius,
			publicMass,
			icebergs,
			spines,
		},
		catalogEstimateFileLoc,
		graph: { files, packages, edges },
	};
}

/** Count descendant files / sources on a full tree. */
function countTreeFiles(node: FileTreeNode): { fileCount: number; sourceCount: number } {
	if (node.kind === 'file') {
		return { fileCount: 1, sourceCount: node.isSource ? 1 : 0 };
	}
	let fileCount = 0;
	let sourceCount = 0;
	for (const c of node.children) {
		const n = countTreeFiles(c);
		fileCount += n.fileCount;
		sourceCount += n.sourceCount;
	}
	return { fileCount, sourceCount };
}

/**
 * Summary tree: keep directory structure; collapse deep file leaves into
 * directory rolls (fileCount / sourceCount). Small folders keep leaves.
 */
function summarizeTree(
	node: FileTreeNode,
	depth: number,
	opts: { maxLeafDepth: number; smallFolderMax: number },
): AgentTreeNode {
	if (node.kind === 'file') {
		return {
			name: node.name,
			path: node.path,
			kind: 'file',
			isSource: node.isSource,
			unparseable: node.unparseable,
			parseNote: node.parseNote || undefined,
		};
	}

	const counts = countTreeFiles(node);
	const keepLeaves =
		depth >= opts.maxLeafDepth || counts.fileCount <= opts.smallFolderMax;

	const children: AgentTreeNode[] = [];
	if (keepLeaves) {
		for (const c of node.children) {
			children.push(summarizeTree(c, depth + 1, opts));
		}
	} else {
		// Keep subdirs (rolled); drop individual file leaves at this level
		for (const c of node.children) {
			if (c.kind === 'dir') {
				children.push(summarizeTree(c, depth + 1, opts));
			}
		}
	}

	return {
		name: node.name,
		path: node.path,
		kind: 'dir',
		isSource: node.isSource,
		unparseable: node.unparseable,
		fileCount: counts.fileCount,
		sourceCount: counts.sourceCount,
		children,
	};
}

function fullTreeNode(node: FileTreeNode): AgentTreeNode {
	if (node.kind === 'file') {
		return {
			name: node.name,
			path: node.path,
			kind: 'file',
			isSource: node.isSource,
			unparseable: node.unparseable,
			parseNote: node.parseNote || undefined,
		};
	}
	const counts = countTreeFiles(node);
	return {
		name: node.name,
		path: node.path,
		kind: 'dir',
		isSource: node.isSource,
		unparseable: node.unparseable,
		fileCount: counts.fileCount,
		sourceCount: counts.sourceCount,
		children: node.children.map(fullTreeNode),
	};
}

/**
 * Hierarchical path tree with parse flags (same pure structure as the UI tree).
 * mode `summary` (default for CLI) rolls dense folders; `full` keeps all leaves.
 */
export function buildAgentTree(input: {
	graph: CodeGraph;
	source: AgentDigestSource;
	warnings?: string[];
	generatedAt?: string;
	mode?: 'full' | 'summary';
}): AgentTreeOut {
	const { graph } = input;
	const mode = input.mode ?? 'summary';
	const importParseable = new Set<string>();
	const parseNotes = new Map<string, string>();
	for (const [path, entry] of graph.parseMap) {
		if (entry.importParseable) importParseable.add(path);
		if (entry.note) parseNotes.set(path, entry.note);
	}
	for (const f of graph.files.values()) {
		if (f.isSource) importParseable.add(f.path);
		if (f.parseNote) parseNotes.set(f.path, f.parseNote);
	}

	const full = buildFileTree([...graph.files.keys()], {
		importParseable,
		parseNotes,
	});

	const tree =
		mode === 'full'
			? fullTreeNode(full)
			: summarizeTree(full, 0, { maxLeafDepth: 3, smallFolderMax: 8 });

	return {
		schema: AGENT_TREE_SCHEMA,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		source: input.source,
		warnings: [...(input.warnings ?? [])],
		mode,
		tree,
	};
}

/**
 * Compact per-file report: degrees, catalog hits, import neighbors — no source dump.
 * Exact mass is not available on this lens (see analysis.fileLens).
 */
export function buildAgentFileReport(input: {
	graph: CodeGraph;
	catalog: MapCatalog;
	source: AgentDigestSource;
	filePath: string;
	warnings?: string[];
	generatedAt?: string;
	/** Cap on listed import/importer neighbors (default 40). */
	neighborLimit?: number;
	scope?: Partial<AgentDigestScope>;
}): AgentFileReport {
	const path = input.filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
	const warnings = [...(input.warnings ?? [])];
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const limit = input.neighborLimit ?? 40;
	const node = input.graph.files.get(path);
	const scope = resolveScope(input.source, input.scope, false);
	const analysis: AgentFileAnalysis = {
		fileLens: FILE_LENS_CAPABILITIES,
		honesty: ANALYSIS_HONESTY_FILE,
	};

	if (!node) {
		return {
			schema: AGENT_FILE_SCHEMA,
			generatedAt,
			source: input.source,
			path,
			exists: false,
			scope,
			analysis,
			warnings: [...warnings, `File not in graph: ${path}`],
		};
	}

	const catalogHits: AgentFileCatalogHits = {};
	const hit = <T extends { id: string }>(
		rows: T[],
		key: keyof AgentFileCatalogHits,
	) => {
		const row = rows.find((r) => r.id === path);
		if (row) (catalogHits as Record<string, T>)[key] = row;
	};
	hit(input.catalog.starts, 'starts');
	hit(input.catalog.hotspots, 'hotspots');
	hit(input.catalog.complex, 'complex');
	// Dual-publish honesty aliases when catalog hits land
	if (catalogHits.complex) catalogHits.downwindReach = catalogHits.complex;
	hit(input.catalog.deepest, 'deepest');
	hit(input.catalog.fileLoc, 'fileLoc');
	hit(input.catalog.blastRadius, 'blastRadius');
	if (catalogHits.blastRadius) catalogHits.reverseReach = catalogHits.blastRadius;
	hit(input.catalog.publicMass ?? [], 'publicMass');
	hit(input.catalog.icebergs ?? [], 'icebergs');
	hit(input.catalog.spines ?? [], 'spines');

	const imports: AgentFileNeighbor[] = [];
	const importers: AgentFileImporter[] = [];
	for (const e of input.graph.edges) {
		if (e.from === path) {
			const pkg = e.toKind === 'package' ? input.graph.packages.get(e.to) : undefined;
			imports.push({
				path: e.to,
				label:
					e.toKind === 'package'
						? (pkg?.name ?? e.to)
						: e.toKind === 'unresolved'
							? e.to.replace(/^unresolved:/, '')
							: e.toKind === 'omitted'
								? e.to.replace(/^omitted:/, '')
								: undefined,
				toKind: e.toKind,
				form: e.form,
				line: e.line,
				...(e.typeOnly ? { typeOnly: true } : {}),
			});
		} else if (e.toKind === 'file' && e.to === path) {
			importers.push({
				path: e.from,
				form: e.form,
				line: e.line,
				...(e.typeOnly ? { typeOnly: true } : {}),
			});
		}
	}

	imports.sort(
		(a, b) => a.line - b.line || a.path.localeCompare(b.path),
	);
	importers.sort(
		(a, b) => a.path.localeCompare(b.path) || a.line - b.line,
	);

	const importsTotal = imports.length;
	const importersTotal = importers.length;
	const importsShownList = imports.slice(0, limit);
	const importersShownList = importers.slice(0, limit);
	const importsShown = importsShownList.length;
	const importersShown = importersShownList.length;
	const truncated = importsTotal > limit || importersTotal > limit;

	return {
		schema: AGENT_FILE_SCHEMA,
		generatedAt,
		source: input.source,
		path,
		exists: true,
		isSource: node.isSource,
		parseNote: node.parseNote || undefined,
		outDegree: fileOutDegree(input.graph, path),
		inDegree: fileInDegree(input.graph, path),
		uniqueOut: fileUniqueOutDegree(input.graph, path),
		uniqueIn: fileUniqueInDegree(input.graph, path),
		scope,
		analysis,
		catalogHits: Object.keys(catalogHits).length ? catalogHits : undefined,
		imports: importsShownList,
		importers: importersShownList,
		importsTotal,
		importersTotal,
		importsShown,
		importersShown,
		truncated,
		warnings,
	};
}
