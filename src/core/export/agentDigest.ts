/**
 * Pure agent-facing projections over CodeGraph + MapCatalog.
 * No FS / process — hosts (CLI, future injectors) call these after indexHostFeed.
 */

import type {
	CatalogBlast,
	CatalogComplex,
	CatalogDeep,
	CatalogEnd,
	CatalogFileLoc,
	CatalogHotspot,
	CatalogStart,
	CodeGraph,
	MapCatalog,
	SuggestedView,
} from '@core/graph/types.ts';
import {
	buildFileTree,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
import { fileInDegree, fileOutDegree } from '@core/view/fileImporters.ts';

export const AGENT_DIGEST_SCHEMA = 'arch-atlas.agent-digest.v1' as const;
export const AGENT_TREE_SCHEMA = 'arch-atlas.agent-tree.v1' as const;
export const AGENT_FILE_SCHEMA = 'arch-atlas.agent-file.v1' as const;

export const ANALYSIS_HONESTY =
	'Level-1 static JS/TS import graph; not LSP / not tree-shake';

export type AgentDigestSource = {
	kind: 'directory' | 'zip';
	/** Absolute or user-supplied path string (host-owned; not resolved by core). */
	path: string;
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
	toKind: 'file' | 'package' | 'unresolved';
	form: 'import' | 'export' | 'require' | 'dynamic';
	line: number;
};

export type AgentDigestCatalog = {
	starts: CatalogStart[];
	ends: CatalogEnd[];
	hotspots: CatalogHotspot[];
	complex: CatalogComplex[];
	deepest: CatalogDeep[];
	fileLoc: CatalogFileLoc[];
	blastRadius: CatalogBlast[];
	views: SuggestedView[];
};

export type AgentDigest = {
	schema: typeof AGENT_DIGEST_SCHEMA;
	generatedAt: string;
	source: AgentDigestSource;
	analysis: {
		tier: 'estimate';
		honesty: string;
	};
	summary: MapCatalog['summary'];
	warnings: string[];
	catalog: AgentDigestCatalog;
	graph: {
		files: AgentDigestGraphFile[];
		packages: AgentDigestGraphPackage[];
		edges: AgentDigestGraphEdge[];
	};
};

export type BuildAgentDigestInput = {
	graph: CodeGraph;
	catalog: MapCatalog;
	source: AgentDigestSource;
	/** Ingest / host warnings (depth skips, zip size, etc.). */
	warnings?: string[];
	/** Override clock for tests. */
	generatedAt?: string;
};

export type AgentTreeOut = {
	schema: typeof AGENT_TREE_SCHEMA;
	generatedAt: string;
	source: AgentDigestSource;
	warnings: string[];
	tree: FileTreeNode;
};

export type AgentFileNeighbor = {
	path: string;
	/** Package label when toKind is package/unresolved. */
	label?: string;
	toKind: 'file' | 'package' | 'unresolved';
	form: 'import' | 'export' | 'require' | 'dynamic';
	line: number;
};

export type AgentFileImporter = {
	path: string;
	form: 'import' | 'export' | 'require' | 'dynamic';
	line: number;
};

export type AgentFileCatalogHits = {
	starts?: CatalogStart;
	hotspots?: CatalogHotspot;
	complex?: CatalogComplex;
	deepest?: CatalogDeep;
	fileLoc?: CatalogFileLoc;
	blastRadius?: CatalogBlast;
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
	catalogHits?: AgentFileCatalogHits;
	/** Outgoing import edges (structural; no source text). */
	imports?: AgentFileNeighbor[];
	/** Incoming file→file import edges. */
	importers?: AgentFileImporter[];
	warnings: string[];
};

function languageForPath(path: string, isSource: boolean): string | undefined {
	if (!isSource) return undefined;
	if (/\.tsx?$/i.test(path)) return 'TypeScript';
	if (/\.jsx?$/i.test(path) || /\.mjs$/i.test(path) || /\.cjs$/i.test(path)) {
		return 'JavaScript';
	}
	return undefined;
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
	}));

	if (graph.stats.sourceCount === 0) {
		warnings.push('Empty graph: no import-parseable source files in feed.');
	}

	return {
		schema: AGENT_DIGEST_SCHEMA,
		generatedAt,
		source,
		analysis: {
			tier: 'estimate',
			honesty: ANALYSIS_HONESTY,
		},
		summary: { ...catalog.summary },
		warnings,
		catalog: {
			starts: catalog.starts,
			ends: catalog.ends,
			hotspots: catalog.hotspots,
			complex: catalog.complex,
			deepest: catalog.deepest,
			fileLoc: catalog.fileLoc,
			blastRadius: catalog.blastRadius,
			views: catalog.views,
		},
		graph: { files, packages, edges },
	};
}

/**
 * Hierarchical path tree with parse flags (same pure structure as the UI tree).
 */
export function buildAgentTree(input: {
	graph: CodeGraph;
	source: AgentDigestSource;
	warnings?: string[];
	generatedAt?: string;
}): AgentTreeOut {
	const { graph } = input;
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

	const tree = buildFileTree([...graph.files.keys()], {
		importParseable,
		parseNotes,
	});

	return {
		schema: AGENT_TREE_SCHEMA,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		source: input.source,
		warnings: [...(input.warnings ?? [])],
		tree,
	};
}

/**
 * Compact per-file report: degrees, catalog hits, import neighbors — no source dump.
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
}): AgentFileReport {
	const path = input.filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
	const warnings = [...(input.warnings ?? [])];
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const limit = input.neighborLimit ?? 40;
	const node = input.graph.files.get(path);

	if (!node) {
		return {
			schema: AGENT_FILE_SCHEMA,
			generatedAt,
			source: input.source,
			path,
			exists: false,
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
	hit(input.catalog.deepest, 'deepest');
	hit(input.catalog.fileLoc, 'fileLoc');
	hit(input.catalog.blastRadius, 'blastRadius');

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
							: undefined,
				toKind: e.toKind,
				form: e.form,
				line: e.line,
			});
		} else if (e.toKind === 'file' && e.to === path) {
			importers.push({
				path: e.from,
				form: e.form,
				line: e.line,
			});
		}
	}

	imports.sort(
		(a, b) => a.line - b.line || a.path.localeCompare(b.path),
	);
	importers.sort(
		(a, b) => a.path.localeCompare(b.path) || a.line - b.line,
	);

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
		catalogHits: Object.keys(catalogHits).length ? catalogHits : undefined,
		imports: imports.slice(0, limit),
		importers: importers.slice(0, limit),
		warnings,
	};
}
