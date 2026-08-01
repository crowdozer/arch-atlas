/**
 * Hierarchical file tree for repository explorer.
 * Pure - no DOM.
 */

export type FileTreeNode = {
	/** Segment name (folder or file basename). */
	name: string;
	/** Full posix path from repo root. */
	path: string;
	kind: 'dir' | 'file';
	children: FileTreeNode[];
	/**
	 * File: import-parseable (Level-1).
	 * Dir: true when any descendant file is import-parseable.
	 */
	isSource: boolean;
	/**
	 * File: false when not import-parseable (grey in UI).
	 * Dir: true when folder has no import-parseable descendants.
	 */
	unparseable: boolean;
	/** Parse note for files (from parseMap); empty for dirs. */
	parseNote: string;
};

export type BuildFileTreeOpts = {
	/**
	 * Paths that are import-parseable. Defaults to treating all files as
	 * parseable when omitted (legacy tests).
	 */
	importParseable?: ReadonlySet<string>;
	/** Optional notes from graph.parseMap for tooltips. */
	parseNotes?: ReadonlyMap<string, string>;
};

/**
 * Paths that are strict prefixes of other paths (directory markers that were
 * incorrectly listed as file leaves, e.g. from ZIP folder entries).
 */
export function directoryPrefixPaths(paths: readonly string[]): Set<string> {
	const prefixes = new Set<string>();
	for (const full of paths) {
		if (!full) continue;
		const parts = full.split('/').filter(Boolean);
		for (let i = 1; i < parts.length; i++) {
			prefixes.add(parts.slice(0, i).join('/'));
		}
	}
	return prefixes;
}

/**
 * Build a sorted directory tree from a list of file paths.
 */
export function buildFileTree(
	paths: readonly string[],
	opts?: BuildFileTreeOpts,
): FileTreeNode {
	const parseable = opts?.importParseable;
	const notes = opts?.parseNotes;
	const root: FileTreeNode = {
		name: '',
		path: '',
		kind: 'dir',
		children: [],
		isSource: false,
		unparseable: true,
		parseNote: '',
	};

	// Never emit a file leaf for a path that is only a folder prefix of others
	const dirPrefixes = directoryPrefixPaths(paths);
	const sorted = [...paths]
		.filter((p) => p && !dirPrefixes.has(p))
		.sort((a, b) => a.localeCompare(b));

	for (const full of sorted) {
		const parts = full.split('/').filter(Boolean);
		let cur = root;
		for (let i = 0; i < parts.length; i++) {
			const name = parts[i]!;
			const isFile = i === parts.length - 1;
			const childPath = parts.slice(0, i + 1).join('/');
			const kind: 'dir' | 'file' = isFile ? 'file' : 'dir';
			// Prefer directory when a phantom file leaf shares the name
			if (!isFile) {
				const phantom = cur.children.findIndex(
					(c) => c.name === name && c.kind === 'file',
				);
				if (phantom >= 0) cur.children.splice(phantom, 1);
			}
			let next = cur.children.find((c) => c.name === name && c.kind === kind);
			if (!next && isFile) {
				// Skip dual file sibling if this name is already a directory
				const asDir = cur.children.find((c) => c.name === name && c.kind === 'dir');
				if (asDir) break;
			}
			if (!next) {
				const fileParseable = isFile
					? parseable
						? parseable.has(childPath)
						: true
					: false;
				next = {
					name,
					path: childPath,
					kind,
					children: [],
					isSource: isFile ? fileParseable : false,
					unparseable: isFile ? !fileParseable : true,
					parseNote: isFile ? (notes?.get(childPath) ?? '') : '',
				};
				cur.children.push(next);
			}
			if (!isFile) cur = next;
		}
	}

	sortTree(root);
	annotateDirParseability(root);
	return root;
}

/** Roll up dir isSource / unparseable from children. */
function annotateDirParseability(node: FileTreeNode): boolean {
	if (node.kind === 'file') return node.isSource;
	let any = false;
	for (const c of node.children) {
		if (annotateDirParseability(c)) any = true;
	}
	node.isSource = any;
	node.unparseable = !any;
	return any;
}

function sortTree(node: FileTreeNode): void {
	node.children.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	for (const c of node.children) sortTree(c);
}

/**
 * Paths that should stay expanded when filtering (ancestors of matches).
 */
export function expandPathsForFilter(
	paths: readonly string[],
	filter: string,
): Set<string> {
	const q = filter.trim().toLowerCase();
	const open = new Set<string>();
	if (!q) {
		// default: expand first two levels of top folders
		for (const p of paths) {
			const parts = p.split('/');
			if (parts.length >= 1) open.add(parts[0]!);
			if (parts.length >= 2) open.add(`${parts[0]}/${parts[1]}`);
		}
		return open;
	}
	for (const p of paths) {
		if (!p.toLowerCase().includes(q)) continue;
		const parts = p.split('/');
		for (let i = 1; i < parts.length; i++) {
			open.add(parts.slice(0, i).join('/'));
		}
	}
	return open;
}

/** Whether a node or any descendant matches the filter. */
export function nodeMatchesFilter(node: FileTreeNode, filter: string): boolean {
	const q = filter.trim().toLowerCase();
	if (!q) return true;
	if (node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q)) {
		return true;
	}
	return node.children.some((c) => nodeMatchesFilter(c, filter));
}
