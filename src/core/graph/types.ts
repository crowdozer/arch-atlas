/**
 * Level-1 CodeGraph types — durable system of record for Arch Atlas MVP.
 * Views and catalog are projections over this model.
 */

export type Epistemic = 'observed' | 'inferred' | 'declared';

export type FileNode = {
	id: string; // path
	kind: 'file';
	path: string;
	/** true when content was parsed for imports */
	isSource: boolean;
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
};

export type CodeGraph = {
	files: Map<string, FileNode>;
	packages: Map<string, PackageNode>;
	edges: ImportEdge[];
	/** raw text by path for source + config files kept in memory */
	contents: Map<string, string>;
	/** package.json parsed at repo roots (usually one) */
	packageJsonPaths: string[];
	stats: {
		fileCount: number;
		sourceCount: number;
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
};

export type CatalogStart = {
	id: string; // file path
	path: string;
	reason: string;
	score: number;
	epistemic: Epistemic;
};

export type CatalogEnd = {
	id: string;
	label: string;
	kind: 'package' | 'builtin' | 'unresolved';
	inDegree: number;
	epistemic: Epistemic;
};

export type SuggestedView = {
	id: string;
	title: string;
	description: string;
	startId: string;
	epistemic: Epistemic;
};

export type MapCatalog = {
	starts: CatalogStart[];
	ends: CatalogEnd[];
	views: SuggestedView[];
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
			nodeAlignment: 'center';
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
	};
};
