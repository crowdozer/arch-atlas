/**
 * File tree paint (web Carbon shell). Injected callbacks — does not import app.ts.
 */
import { fileLineCount } from '@core/index.ts';
import {
	buildFileTree,
	expandPathsForFilter,
	nodeMatchesFilter,
	type FileTreeNode,
} from '@core/tree/fileTree.ts';
import type { Session } from '@shell/types.ts';
import { $, escapeHtml, setStatus } from './dom.ts';
import { treeIconSvg } from './treeIcons.ts';

export type TreeRenderDeps = {
	getSession: () => Session | null;
	selectStart: (path: string) => void;
	persistSessionIfEnabled: () => void;
};

function parseableSetFromGraph(session: Session | null): Set<string> {
	const g = session?.graph;
	if (!g) return new Set();
	if (g.parseMap?.size) {
		const s = new Set<string>();
		for (const [path, entry] of g.parseMap) {
			if (entry.importParseable) s.add(path);
		}
		return s;
	}
	// Fallback if older in-memory shape
	const s = new Set<string>();
	for (const [path, node] of g.files) {
		if (node.isSource) s.add(path);
	}
	return s;
}

function parseNotesFromGraph(session: Session | null): Map<string, string> {
	const g = session?.graph;
	const m = new Map<string, string>();
	if (!g) return m;
	if (g.parseMap?.size) {
		for (const [path, entry] of g.parseMap) {
			m.set(path, entry.note);
		}
		return m;
	}
	for (const [path, node] of g.files) {
		if (node.parseNote) m.set(path, node.parseNote);
	}
	return m;
}

/** Read cds-search / input value from the tree filter host. */
function treeFilterValue(): string {
	const el = $('atlas-tree-filter') as (HTMLElement & { value?: string }) | null;
	if (!el) return '';
	return typeof el.value === 'string' ? el.value : '';
}

/** True when `dirPath` is a path prefix of the active start file (breadcrumb folders). */
export function isAncestorOfActiveFile(
	dirPath: string,
	startId: string | null | undefined,
): boolean {
	if (!startId || !dirPath) return false;
	return startId === dirPath || startId.startsWith(`${dirPath}/`);
}

export function createTreeRenderer(deps: TreeRenderDeps): {
	renderTree: () => void;
} {
	function renderTreeNode(
		node: FileTreeNode,
		depth: number,
		filter: string,
	): HTMLElement {
		const session = deps.getSession();

		if (node.kind === 'dir') {
			const wrap = document.createElement('div');
			wrap.className = 'atlas-tree__dir';
			wrap.setAttribute('role', 'group');

			const open = session!.expanded.has(node.path);
			const onActivePath = isAncestorOfActiveFile(node.path, session?.startId);
			const row = document.createElement('button');
			row.type = 'button';
			row.className = 'atlas-tree__row atlas-tree__row--dir';
			if (node.unparseable) row.classList.add('is-unparseable');
			// Purple for folders on the path to the selected file (expanded or collapsed)
			if (onActivePath && !node.unparseable) {
				row.classList.add('is-active-path');
			}
			row.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
			row.setAttribute('aria-expanded', open ? 'true' : 'false');
			row.dataset.path = node.path;
			const dirTitle = node.unparseable
				? `${node.path} — no import-parseable files in this folder`
				: node.path;
			row.title = dirTitle;
			row.innerHTML = `
			<span class="atlas-tree__chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
			<span class="atlas-tree__icon" aria-hidden="true">${treeIconSvg('dir', node.path, { open })}</span>
			<span class="atlas-tree__name truncate">${escapeHtml(node.name)}</span>
			<span class="atlas-tree__badge">${node.children.length}</span>
		`;
			row.addEventListener('click', (e) => {
				e.preventDefault();
				const s = deps.getSession();
				if (!s) return;
				if (s.expanded.has(node.path)) s.expanded.delete(node.path);
				else s.expanded.add(node.path);
				deps.persistSessionIfEnabled();
				renderTree();
			});
			wrap.appendChild(row);

			if (open) {
				const kids = document.createElement('div');
				kids.className = 'atlas-tree__children';
				for (const c of node.children) {
					if (!nodeMatchesFilter(c, filter)) continue;
					kids.appendChild(renderTreeNode(c, depth + 1, filter));
				}
				wrap.appendChild(kids);
			}
			return wrap;
		}

		// file — greying from parseMap / tree annotation (not ad-hoc extension checks)
		const isSrc = node.isSource;
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'atlas-tree__row atlas-tree__row--file';
		if (isSrc) btn.classList.add('is-source');
		else btn.classList.add('is-unparseable');
		if (session?.startId === node.path) btn.classList.add('is-selected');
		btn.style.paddingLeft = `${0.4 + depth * 0.85}rem`;
		btn.dataset.path = node.path;
		const note =
			node.parseNote || session?.graph.parseMap.get(node.path)?.note || '';
		btn.title = note ? `${node.path}\n${note}` : node.path;
		btn.setAttribute('aria-disabled', isSrc ? 'false' : 'true');

		const loc = session ? fileLineCount(session.graph, node.path) : 0;
		btn.innerHTML = `
		<span class="atlas-tree__chevron atlas-tree__chevron--spacer" aria-hidden="true"></span>
		<span class="atlas-tree__icon${isSrc ? ' atlas-tree__icon--source' : ' atlas-tree__icon--muted'}" aria-hidden="true">${treeIconSvg('file', node.path)}</span>
		<span class="atlas-tree__name truncate">${escapeHtml(node.name)}</span>
		<span class="atlas-tree__loc" title="${loc} lines of code">${loc} LOC</span>
	`;
		btn.addEventListener('click', () => {
			if (isSrc) {
				deps.selectStart(node.path);
				return;
			}
			const s = deps.getSession();
			const entry = s?.graph.parseMap.get(node.path);
			const why = entry?.note || note || 'Not import-parseable at Level-1';
			setStatus(`${node.path}: ${why}`);
		});
		return btn;
	}

	function renderTree(): void {
		const host = $('atlas-tree');
		const session = deps.getSession();
		if (!host || !session) return;
		host.replaceChildren();

		const filter = treeFilterValue();
		const paths = [...session.graph.files.keys()];
		const tree = buildFileTree(paths, {
			importParseable: parseableSetFromGraph(session),
			parseNotes: parseNotesFromGraph(session),
		});
		const q = filter.trim();

		// When filtering, force-open matching ancestors (merge with user expand state)
		if (q) {
			for (const p of expandPathsForFilter(paths, q)) {
				session.expanded.add(p);
			}
		}

		const frag = document.createDocumentFragment();
		for (const child of tree.children) {
			if (!nodeMatchesFilter(child, q)) continue;
			frag.appendChild(renderTreeNode(child, 0, q));
		}
		host.appendChild(frag);

		if (!host.childElementCount) {
			host.innerHTML = `<p class="px-2 py-1 text-xs text-zinc-600">No files match.</p>`;
		}
	}

	return { renderTree };
}
