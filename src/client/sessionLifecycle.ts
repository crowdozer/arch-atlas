/**
 * Session lifecycle (web host): zip / demo / open / restore / reset / activate.
 *
 * Extracted from the composition root — same param-object deps pattern as
 * `exactPaintMode` and `wireUi`. Module state (`session`, `viewStack`, depth)
 * stays owned by `app.ts` via get/set injectors; no Session class / DI framework.
 */

import {
	HUB_DEFAULT_MAX_DEPTH,
	expandPathsForFilter,
	indexFiles,
	ingestZip,
	type MapCatalog,
	type VirtualFile,
} from '@core/index.ts';
import {
	viewForFileOpen,
	type AtlasView,
	type Session,
} from '@shell/index.ts';
import { $ } from './dom.ts';
import { type DemoId, loadDemoFiles } from './demoFixtures.ts';
import {
	clearPersistedSession,
	loadPersistedSession,
} from './sessionStore.ts';

export type SessionLifecycleDeps = {
	getSession: () => Session | null;
	setSession: (s: Session | null) => void;
	/** Clear or replace the navigation stack (ownership stays in app). */
	setViewStack: (stack: AtlasView[]) => void;
	setDepthUserSet: (v: boolean) => void;
	setVizMaxDepth: (d: number) => void;
	resetExactState: () => void;
	tryAutoExactWhenLocalAvailable: () => Promise<void>;
	clearStage: () => void;
	renderCatalog: (catalog: MapCatalog, startId: string | null) => void;
	renderTree: () => void;
	navigateReplace: (
		view: AtlasView,
		opts?: { skipPersist?: boolean },
	) => boolean;
	persistSessionIfEnabled: () => void;
	isPersistEnabled: () => boolean;
	setStatus: (msg: string) => void;
	showWarnings: (warnings: string[]) => void;
	updateCaption: (view: AtlasView | null) => void;
	updateBackButton: () => void;
	syncDepthDropdown: () => void;
};

export type SessionLifecycle = {
	handleZip: (file: File) => Promise<void>;
	handleDemo: (id: DemoId) => void;
	tryRestoreSession: () => boolean;
	resetSession: () => void;
	/** Catalog / tree / restore: replace stack with file-hub at startId. */
	selectStart: (startId: string, opts?: { skipPersist?: boolean }) => void;
	/** Expand tree ancestors so `startId` is visible. */
	expandToPath: (startId: string) => void;
};

/**
 * Session open / restore / reset orchestration for the web host.
 * Call after nav + paint injectors exist; methods close over deps at call time.
 */
export function createSessionLifecycle(
	deps: SessionLifecycleDeps,
): SessionLifecycle {
	function showWorkspaceShell(): void {
		$('atlas-upload')?.classList.add('hidden');
		// CSS: .atlas-workspace is display:flex; .atlas-workspace.hidden is none
		$('atlas-workspace')?.classList.remove('hidden');
		$('atlas-subbar')?.classList.remove('hidden');
		$('atlas-subbar')?.classList.add('flex');
	}

	function expandToPath(startId: string): void {
		const session = deps.getSession();
		if (!session) return;
		const parts = startId.split('/');
		for (let i = 1; i < parts.length; i++) {
			session.expanded.add(parts.slice(0, i).join('/'));
		}
	}

	/** Catalog / tree / restore: replace stack with file-hub at startId. */
	function selectStart(
		startId: string,
		opts?: { skipPersist?: boolean },
	): void {
		if (!deps.getSession()) return;
		deps.navigateReplace(viewForFileOpen(startId), opts);
	}

	function activateSession(
		next: Session,
		statusLine: string,
		opts?: { skipPersist?: boolean },
	): void {
		// New graph → rebuild Exact provider on next enable (contents snapshot)
		deps.resetExactState();
		deps.setSession(next);
		deps.showWarnings(next.warnings);
		showWorkspaceShell();
		deps.renderCatalog(next.catalog, next.startId);
		if (next.startId) selectStart(next.startId, { skipPersist: true });
		else {
			deps.renderTree();
			deps.setStatus(statusLine);
		}
		deps.setStatus(statusLine);
		if (!opts?.skipPersist) deps.persistSessionIfEnabled();
		// Prefer Exact when local classic TS / host inject is already available (no CDN)
		void deps.tryAutoExactWhenLocalAvailable();
	}

	function openFromFiles(
		files: VirtualFile[],
		opts?: { warnings?: string[]; statusPrefix?: string },
	): void {
		if (!files.length) {
			deps.setStatus('No readable text files.');
			return;
		}
		deps.setStatus(`Indexing ${files.length} files…`);
		const { graph, catalog: cat } = indexFiles(files);
		const paths = [...graph.files.keys()];
		const prefix = opts?.statusPrefix ?? 'Indexed';
		activateSession(
			{
				graph,
				catalog: cat,
				startId: cat.starts[0]?.id ?? null,
				warnings: opts?.warnings ?? [],
				expanded: expandPathsForFilter(paths, ''),
			},
			`${prefix} ${graph.stats.parseableCount ?? graph.stats.sourceCount} parseable · ${graph.stats.unparseableCount ?? 0} unparseable · ${graph.stats.edgeCount} edges`,
		);
	}

	async function handleZip(file: File): Promise<void> {
		deps.setStatus(`Reading ${file.name}…`);
		deps.showWarnings([]);
		try {
			const buf = await file.arrayBuffer();
			deps.setStatus('Unpacking ZIP…');
			const { files, skipped, warnings } = ingestZip(buf);
			openFromFiles(files, {
				warnings: [
					...warnings,
					skipped ? `Skipped ${skipped} ignored/binary paths.` : '',
				].filter(Boolean),
			});
		} catch (err) {
			console.error(err);
			deps.setStatus(err instanceof Error ? err.message : String(err));
		}
	}

	function handleDemo(id: DemoId): void {
		deps.showWarnings([]);
		try {
			deps.setStatus(`Loading demo “${id}”…`);
			const files = loadDemoFiles(id);
			openFromFiles(files, {
				statusPrefix: `Demo ${id} ·`,
				warnings: [`Loaded built-in demo: ${id}`],
			});
		} catch (err) {
			console.error(err);
			deps.setStatus(err instanceof Error ? err.message : String(err));
		}
	}

	function tryRestoreSession(): boolean {
		if (!deps.isPersistEnabled()) return false;
		const stored = loadPersistedSession();
		if (!stored) return false;
		try {
			deps.setStatus('Restoring remembered project…');
			const { graph, catalog: cat } = indexFiles(stored.files);
			const startId =
				stored.startId && graph.files.has(stored.startId)
					? stored.startId
					: (cat.starts[0]?.id ?? null);
			const expanded = new Set(stored.expanded);
			// Ensure tree has something open if nothing was stored
			if (!expanded.size) {
				for (const p of expandPathsForFilter([...graph.files.keys()], '')) {
					expanded.add(p);
				}
			}
			activateSession(
				{
					graph,
					catalog: cat,
					startId,
					warnings: stored.warnings,
					expanded,
				},
				`Restored ${graph.stats.sourceCount} sources · ${graph.stats.edgeCount} edges (localStorage)`,
				{ skipPersist: true },
			);
			return true;
		} catch (err) {
			console.error('[atlas] restore failed', err);
			clearPersistedSession();
			deps.setStatus('Could not restore remembered project — upload again.');
			return false;
		}
	}

	function resetSession(): void {
		deps.setSession(null);
		deps.setViewStack([]);
		// Fresh session gets hub depth default again
		deps.setDepthUserSet(false);
		deps.setVizMaxDepth(HUB_DEFAULT_MAX_DEPTH);
		deps.resetExactState();
		clearPersistedSession();
		deps.clearStage();
		deps.updateCaption(null);
		deps.updateBackButton();
		deps.syncDepthDropdown();

		$('atlas-workspace')?.classList.add('hidden');
		$('atlas-subbar')?.classList.add('hidden');
		$('atlas-subbar')?.classList.remove('flex');
		$('atlas-upload')?.classList.remove('hidden');
		deps.setStatus('');
		const uploadStatus = $('atlas-upload-status');
		if (uploadStatus) uploadStatus.textContent = '';
		deps.showWarnings([]);
	}

	return {
		handleZip,
		handleDemo,
		tryRestoreSession,
		resetSession,
		selectStart,
		expandToPath,
	};
}
