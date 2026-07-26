/**
 * Hierarchical file tree for repository explorer.
 * Pure — no DOM.
 */

export type FileTreeNode = {
	/** Segment name (folder or file basename). */
	name: string;
	/** Full posix path from repo root. */
	path: string;
	kind: 'dir' | 'file';
	children: FileTreeNode[];
	isSource: boolean;
};

/**
 * Build a sorted directory tree from a list of file paths.
 */
export function buildFileTree(paths: readonly string[]): FileTreeNode {
	const root: FileTreeNode = {
		name: '',
		path: '',
		kind: 'dir',
		children: [],
		isSource: false,
	};

	const sorted = [...paths].sort((a, b) => a.localeCompare(b));
	for (const full of sorted) {
		if (!full) continue;
		const parts = full.split('/').filter(Boolean);
		let cur = root;
		for (let i = 0; i < parts.length; i++) {
			const name = parts[i]!;
			const isFile = i === parts.length - 1;
			const childPath = parts.slice(0, i + 1).join('/');
			const kind: 'dir' | 'file' = isFile ? 'file' : 'dir';
			let next = cur.children.find((c) => c.name === name && c.kind === kind);
			if (!next) {
				next = {
					name,
					path: childPath,
					kind,
					children: [],
					isSource: false,
				};
				cur.children.push(next);
			}
			if (!isFile) cur = next;
		}
	}

	sortTree(root);
	return root;
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
