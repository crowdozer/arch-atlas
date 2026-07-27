/**
 * Level-1 CodeGraph types — durable system of record for Arch Atlas MVP.
 * Views and catalog are projections over this model.
 */

export type Epistemic = 'observed' | 'inferred' | 'declared';

/** How a file relates to Level-1 import extraction (see parse/capability). */
export type FileParseKind =
	| 'js-ts-import'
	| 'python-import'
	| 'astro-import'
	| 'config'
	| 'text'
	| 'unsupported-language';

export type FileNode = {
	id: string; // path
	kind: 'file';
	path: string;
	/** true when content was parsed for imports (import-parseable) */
	isSource: boolean;
	/** Parse capability kind (intelligent map entry). */
	parseKind: FileParseKind;
	/** Human reason when not import-parseable (tree tooltip / status). */
	parseNote: string;
	byteLength: number;
};

export type PackageNode = {
	id: string; // bare package name e.g. "zod" or "node:fs"
	kind: 'package';
	name: string;
	/** from package.json deps, import bare name, or builtin */
	source: 'package.json' | 'import' | 'builtin';
	epistemic: Epistemic;
};

export type GraphNode = FileNode | PackageNode;

/**
 * Local names introduced by an import clause (Level-1 parse; not type-checked).
 * Used for estimate callsites / evidence — not for exact tree-shaken surface.
 */
export type ImportBinding =
	| { kind: 'named'; imported: string; local: string }
	| { kind: 'default'; local: string }
	| { kind: 'namespace'; local: string }
	| { kind: 'side-effect' };

export type ImportEdge = {
	id: string;
	kind: 'imports';
	from: string; // file path
	to: string; // file path or package id
	toKind: 'file' | 'package' | 'unresolved';
	/** original specifier as written in source */
	specifier: string;
	epistemic: Epistemic;
	/** static import | export-from | require | dynamic import() */
	form: 'import' | 'export' | 'require' | 'dynamic';
	/** 1-based line of the import statement in `from` (observed). */
	line: number;
	/** Clause bindings from Level-1 parse (estimate evidence). */
	bindings: ImportBinding[];
};

/**
 * Durable parse-capability map for one path (mirrors FileNode parse fields).
 * Kept as an explicit map so views/UI do not re-derive extension rules ad hoc.
 */
export type ParseMapEntry = {
	path: string;
	importParseable: boolean;
	kind: FileParseKind;
	note: string;
};

export type CodeGraph = {
	files: Map<string, FileNode>;
	packages: Map<string, PackageNode>;
	edges: ImportEdge[];
	/** raw text by path for source + config files kept in memory */
	contents: Map<string, string>;
	/** package.json parsed at repo roots (usually one) */
	packageJsonPaths: string[];
	/**
	 * Intelligent parse map: every graph file → whether imports were/can be parsed.
	 * Same membership as `files`; authority for tree greying and status copy.
	 */
	parseMap: Map<string, ParseMapEntry>;
	stats: {
		fileCount: number;
		sourceCount: number;
		/** Count of import-parseable files (isSource). */
		parseableCount: number;
		/** Count of kept files that are not import-parseable. */
		unparseableCount: number;
		edgeCount: number;
		packageCount: number;
		unresolvedCount: number;
	};
};

export type VirtualFile = {
	path: string;
	content: string;
	byteLength: number;
};

export type ExtractedImport = {
	specifier: string;
	form: ImportEdge['form'];
	line: number;
	/** Observed clause bindings; empty when form has no clause (or unparsed). */
	bindings: ImportBinding[];
};

export type CatalogStart = {
	id: string; // file path
	path: string;
	reason: string;
	score: number;
	/** Observed outgoing import edges from this file. */
	outDegree: number;
	/** Observed incoming file-import edges to this file. */
	inDegree: number;
	epistemic: Epistemic;
};

export type CatalogEnd = {
	id: string;
	label: string;
	kind: 'package' | 'builtin' | 'unresolved';
	inDegree: number;
	epistemic: Epistemic;
};

/** Source file ranked by total observed import edges (explorability). */
export type CatalogHotspot = {
	id: string;
	path: string;
	/** outDegree + inDegree (file→file in only). */
	edgeCount: number;
	outDegree: number;
	inDegree: number;
	/** Outgoing edges to packages / unresolved. */
	packageOut: number;
	epistemic: 'observed';
};

/** Source file ranked by deepest outbound file→file import hops (tree depth). */
export type CatalogDeep = {
	id: string;
	path: string;
	/** Max BFS distance from this file along file import edges. */
	maxHops: number;
	/** Reachable files including self. */
	reachableFiles: number;
	/** Distinct packages/unresolved touched in the reachable set. */
	packageEnds: number;
	edgeCount: number;
	outDegree: number;
	inDegree: number;
	epistemic: 'observed';
};

/**
 * Source file ranked by outbound tree complexity:
 * all downwind import edges (file→file + file→package) from the start.
 */
export type CatalogComplex = {
	id: string;
	path: string;
	/**
	 * Primary score: edges with `from` in the outbound reachable set
	 * (file imports + package imports). start→page→pkg = 2.
	 */
	downwindEdges: number;
	/** Distinct packages/unresolved reachable downwind (secondary). */
	packageEnds: number;
	reachableFiles: number;
	maxHops: number;
	edgeCount: number;
	outDegree: number;
	inDegree: number;
	epistemic: 'observed';
};

/**
 * Source file ranked by whole-file LOC (newline count of graph.contents).
 * Same estimate surface as tree LOC captions / weight target-loc.
 */
export type CatalogFileLoc = {
	id: string;
	path: string;
	/** Whole-file line count from indexed source text. */
	loc: number;
	outDegree: number;
	inDegree: number;
	epistemic: 'observed';
};

/**
 * Reverse blast radius: consumers that can reach this file via import chains.
 * reverseReachFiles excludes self; ranking is pure observed counts.
 */
export type CatalogBlast = {
	id: string;
	path: string;
	/** Distinct reverse-reachable files excluding self. */
	reverseReachFiles: number;
	/** Max BFS hops reverse along fileImportedBy. */
	reverseMaxHops: number;
	inDegree: number;
	outDegree: number;
	epistemic: 'observed';
};

/**
 * Spine ranking formula (user-selectable projection over observed fan-in geometry).
 * Default: modules-then-in.
 */
export type SpineFormula =
	| 'modules-then-in'
	| 'fan-in'
	| 'composite'
	| 'share';

/**
 * Cross-cutting dependency plane: high direct fan-in + importer module diversity.
 * Observed import graph + stable path folders (topFolder) — not a basename classifier.
 */
export type CatalogSpine = {
	id: string;
	path: string;
	/** Distinct file→file importers. */
	inDegree: number;
	outDegree: number;
	/** Distinct topFolder keys of direct importers. */
	importerModuleCount: number;
	/** Multi-hop reverse reach (exclude self); complement to blast bin. */
	reverseReachFiles: number;
	/** inDegree / sourceCount (0 when sourceCount is 0). */
	inShare: number;
	/** inDegree * importerModuleCount. */
	composite: number;
	epistemic: 'observed';
};

/**
 * Large whole-file with export surface ≈ whole (Exact ratio).
 * Empty until Exact overlay provides export-surface LOC.
 */
export type CatalogPublicMass = {
	id: string;
	path: string;
	wholeLoc: number;
	/** Export-declaration surface LOC (Exact). */
	surfaceLoc: number;
	/** surfaceLoc / wholeLoc when wholeLoc > 0. */
	ratio: number;
	outDegree: number;
	inDegree: number;
	epistemic: 'observed';
};

/**
 * Large whole-file with substantial private body under smaller export surface.
 * Empty until Exact overlay.
 */
export type CatalogIceberg = {
	id: string;
	path: string;
	wholeLoc: number;
	surfaceLoc: number;
	/** max(0, wholeLoc - surfaceLoc). */
	privateLoc: number;
	ratio: number;
	outDegree: number;
	inDegree: number;
	epistemic: 'observed';
};

export type MapCatalog = {
	starts: CatalogStart[];
	ends: CatalogEnd[];
	/** High-edge files for one-click exploration. */
	hotspots: CatalogHotspot[];
	/** Heaviest outbound trees by downwind edge mass (tree complexity). */
	complex: CatalogComplex[];
	/** Deepest outbound import graphs (tree depth / most hops). */
	deepest: CatalogDeep[];
	/** Largest source files by whole-file LOC (high → low). */
	fileLoc: CatalogFileLoc[];
	/** Reverse-reach blast radius (import consumers). */
	blastRadius: CatalogBlast[];
	/**
	 * Public-mass files (Exact ratio). Empty at estimate index; filled by Exact overlay.
	 */
	publicMass: CatalogPublicMass[];
	/**
	 * Iceberg files (Exact private mass). Empty at estimate index; filled by Exact overlay.
	 */
	icebergs: CatalogIceberg[];
	/** Cross-cutting spines (topology; always from estimate graph). */
	spines: CatalogSpine[];
	/** Formula used to rank `spines` (optional stamp). */
	spineFormula?: SpineFormula;
	summary: {
		sourceCount: number;
		packageCount: number;
		edgeCount: number;
		unresolvedCount: number;
		languages: string[];
	};
};

export type AlluvialLink = {
	source: string;
	target: string;
	value: number;
};

export type AlluvialNode = {
	name: string;
	category: string;
	rank: number;
};

/** Focus of an alluvial projection (drill-down target). */
export type AlluvialFocusKind = 'file' | 'package' | 'module' | 'unresolved';

export type AlluvialFocus = {
	kind: AlluvialFocusKind;
	id: string;
	label: string;
};

/** Display-name → durable identity for click drill-down. */
export type AlluvialNodeRefKind = AlluvialFocusKind | 'bucket';

export type AlluvialNodeRef = {
	kind: AlluvialNodeRefKind;
	id: string;
};

export type AlluvialPayload = {
	data: AlluvialLink[];
	options: {
		title: string;
		theme: 'g100';
		height: string;
		animations: boolean;
		toolbar: { enabled: boolean };
		legend: { enabled: boolean; clickable: boolean };
		accessibility: { svgAriaLabel: string };
		alluvial: {
			units: string;
			nodes: AlluvialNode[];
			/**
			 * Carbon only honors `left` | `right`; anything else falls through to
			 * d3-sankey **justify** (leaves without outbound links snap to the
			 * rightmost column). We send `left` so hub depth matches category columns.
			 */
			nodeAlignment: 'left' | 'right' | 'center';
		};
		color: { scale: Record<string, string> };
		tooltip: { enabled: boolean };
	};
	meta: {
		/** File focus only — start file path. */
		startId?: string;
		focus: AlluvialFocus;
		/** Display node name → kind + id for drill resolution. */
		nodeRef: Record<string, AlluvialNodeRef>;
		nodeRank: Record<string, number>;
		/**
		 * Reverse free sources / export-tree dead-ends (Exports* left): no kept
		 * outer reverse parent. Includes single-column Exports (max reverse hops
		 * 1) and multi-hop padded free sources + outer rim. Polish: **cyan** wrap
		 * (contrast on yellow export columns). Never includes rail ids.
		 */
		terminators?: string[];
		/**
		 * Forward true leaves (Imports* / External, right) with no non-rail
		 * out-edge. Polish: **yellow** wrap (contrast on cyan import columns).
		 * Never includes rail ids. Field name is historical (`exportTerminators`).
		 */
		exportTerminators?: string[];
		/**
		 * Construction-time External package attachments (display labels +
		 * residual/package widths). Polish straighten uses these instead of
		 * recovering pairs via shared in-rail BFS (which cross-products parents
		 * × packages on a merged rail).
		 */
		externalStraightPairs?: {
			parent: string;
			packageName: string;
			width: number;
		}[];
	};
};
