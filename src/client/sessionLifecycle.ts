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
	filterFilesByTestInclusion,
	indexFiles,
	ingestZip,
	type LocPrecision,
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

/** How the session is being activated — open resets Exact; reindex preserves chrome. */
export type ActivateSessionKind = 'open' | 'reindex';

export type SessionLifecycleDeps = {
	getSession: () => Session | null;
	setSession: (s: Session | null) => void;
	/** Clear or replace the navigation stack (ownership stays in app). */
	setViewStack: (stack: AtlasView[]) => void;
	setDepthUserSet: (v: boolean) => void;
	setVizMaxDepth: (d: number) => void;
	/** Precision before graph swap (reindex snapshot). */
	getLocPrecision: () => LocPrecision;
	/**
	 * Cancel in-flight Program worker before graph identity changes.
	 * Optional — hosts without Program skip.
	 */
	cancelProgramEnrichment?: () => void;
	/** Full Exact reset (ZIP/demo/open/reset). Forces Estimate + clears spine at app layer. */
	resetExactState: () => void;
	/**
	 * Graph file-set changed: drop Exact provider + mass cache only.
	 * Must not force Estimate or clear spine formula / weight axis.
	 */
	invalidateExactProvider: () => void;
	/** Rebuild Exact for the new graph when user was on Exact before reindex. */
	rehydrateExactForGraph: () => Promise<void>;
	/**
	 * Re-run Program enrich for the new graph when user was on Program before
	 * reindex (Exact parity). Optional preferExactMass when prior programExactMass.
	 */
	enableProgramMode?: (opts?: { preferExactMass?: boolean }) => Promise<void>;
	/** Prior Program had Exact mass rehydrated (snapshot before invalidate). */
	getProgramExactMass?: () => boolean;
	/** Align Precision / Weight dropdowns to current module state. */
	syncExactChrome: () => void;
	tryAutoExactWhenLocalAvailable: () => Promise<void>;
	/**
	 * Sticky engine prefs on open: Exact/Program re-apply (may CDN) or stay
	 * Estimate when demoted. When absent, open falls through to auto-local only.
	 */
	applyStickyEnginePref?: () => Promise<
		'applied' | 'stay-estimate' | 'none'
	>;
	clearStage: () => void;
	renderCatalog: (catalog: MapCatalog, startId: string | null) => void;
	renderTree: () => void;
	navigateReplace: (
		view: AtlasView,
		opts?: { skipPersist?: boolean },
	) => boolean;
	persistSessionIfEnabled: () => void;
	isPersistEnabled: () => boolean;
	/** Web inclusion toggle; default true (matches CLI default of not omitting tests). */
	getIncludeTests: () => boolean;
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
	/**
	 * Re-index the full feed under the current include-tests preference.
	 * No-op without an active session / feed.
	 */
	reindexWithTestInclusion: () => void;
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

	/**
	 * Open file-hub for startId. Returns whether navigateReplace succeeded
	 * (false when hub payload is null / no edges).
	 */
	function trySelectStart(
		startId: string,
		opts?: { skipPersist?: boolean },
	): boolean {
		if (!deps.getSession()) return false;
		return deps.navigateReplace(viewForFileOpen(startId), opts);
	}

	/**
	 * Auto-open preferred start; if hub is null, try remaining catalog starts
	 * (first with edges). Does not invent hub edges.
	 */
	function openPreferredStart(
		preferredId: string,
		starts: { id: string }[],
		opts?: { skipPersist?: boolean },
	): boolean {
		if (trySelectStart(preferredId, opts)) return true;
		for (const s of starts) {
			if (s.id === preferredId) continue;
			if (trySelectStart(s.id, opts)) return true;
		}
		return false;
	}

	function activateSession(
		next: Session,
		statusLine: string,
		opts?: {
			skipPersist?: boolean;
			kind?: ActivateSessionKind;
			/**
			 * Remembered precision from localStorage (boot restore only).
			 * New ZIP/demo omit → auto Exact when local engine exists.
			 */
			restorePrecision?: LocPrecision;
		},
	): void {
		const kind: ActivateSessionKind = opts?.kind ?? 'open';
		// Snapshot before any Exact invalidate/reset / Program cancel
		const wasExact =
			kind === 'reindex' && deps.getLocPrecision() === 'exact';
		const wasProgram =
			kind === 'reindex' && deps.getLocPrecision() === 'program';

		// Drop in-flight Program enrich (stale graph after open/reindex)
		deps.cancelProgramEnrichment?.();

		if (kind === 'reindex') {
			// Same project, new file set — drop stale provider/mass; keep precision chrome
			deps.invalidateExactProvider();
			if (wasExact) {
				// Gate fails closed without mount when Exact + no provider, and would
				// leave the *previous* alluvial on screen. Clear so tree/catalog can
				// update without a stale chart under Precision=Exact until rehydrate.
				deps.clearStage();
			}
		} else {
			// New ZIP/demo/restore open — full Exact + spine chrome reset
			deps.resetExactState();
		}

		deps.setSession(next);
		deps.showWarnings(next.warnings);
		showWorkspaceShell();
		deps.renderCatalog(next.catalog, next.startId);
		if (next.startId) {
			// Null hub for preferred start must not leave tree unpainted; try next starts.
			const opened = openPreferredStart(
				next.startId,
				next.catalog.starts,
				{ skipPersist: true },
			);
			if (!opened) {
				deps.renderTree();
			}
		} else {
			deps.renderTree();
			deps.setStatus(statusLine);
		}
		// Reassert status after navigate (gate may have written a fail-closed line)
		const restorePrecision = opts?.restorePrecision;
		const rebuildNote = wasProgram
			? ' · rebuilding Program…'
			: wasExact
				? ' · rebuilding Exact…'
				: restorePrecision === 'program'
					? ' · restoring Program…'
					: restorePrecision === 'exact'
						? ' · restoring Exact…'
						: '';
		deps.setStatus(`${statusLine}${rebuildNote}`);
		if (!opts?.skipPersist) deps.persistSessionIfEnabled();

		if (kind === 'reindex') {
			// Carbon dropdowns must match preserved JS state (not forced Estimate)
			deps.syncExactChrome();
			if (wasProgram && deps.enableProgramMode) {
				// Re-apply createProgram + Exact mass on the new L1 graph
				void deps.enableProgramMode();
			} else if (wasExact) {
				// Rebuild provider for new graph; on fail falls back to Estimate honestly.
				// Generation token inside rehydrate discards stale rapid-toggle races.
				void deps.rehydrateExactForGraph();
			}
			// Estimate stays Estimate — do not tryAutoExact (avoids surprise flip)
			return;
		}

		// Boot restore: re-apply remembered Precision (Program includes Exact mass)
		if (restorePrecision === 'program' && deps.enableProgramMode) {
			void deps.enableProgramMode();
			return;
		}
		if (restorePrecision === 'exact') {
			void deps.rehydrateExactForGraph();
			return;
		}

		// Sticky higher-fidelity engine prefs (Exact/Program), else auto-local Exact
		void (async () => {
			const sticky = deps.applyStickyEnginePref
				? await deps.applyStickyEnginePref()
				: 'none';
			if (sticky === 'applied' || sticky === 'stay-estimate') return;
			// Prefer Exact when local classic TS / host inject is already available (no CDN)
			await deps.tryAutoExactWhenLocalAvailable();
		})();
	}

	function openFromFiles(
		files: VirtualFile[],
		opts?: { warnings?: string[]; statusPrefix?: string },
	): void {
		if (!files.length) {
			deps.setStatus('No readable text files.');
			return;
		}
		const includeTests = deps.getIncludeTests();
		const indexed = filterFilesByTestInclusion(files, includeTests);
		if (!indexed.length) {
			deps.setStatus(
				includeTests
					? 'No readable text files.'
					: 'No files left after excluding tests — turn Include tests back on.',
			);
			return;
		}
		deps.setStatus(`Indexing ${indexed.length} files…`);
		const { graph, catalog: cat } = indexFiles(indexed);
		const paths = [...graph.files.keys()];
		const prefix = opts?.statusPrefix ?? 'Indexed';
		const excluded = files.length - indexed.length;
		const exclusionNote =
			!includeTests && excluded > 0 ? ` · tests off (−${excluded})` : '';
		activateSession(
			{
				graph,
				catalog: cat,
				startId: cat.starts[0]?.id ?? null,
				warnings: opts?.warnings ?? [],
				expanded: expandPathsForFilter(paths, ''),
				files,
			},
			`${prefix} ${graph.stats.parseableCount ?? graph.stats.sourceCount} parseable · ${graph.stats.unparseableCount ?? 0} unparseable · ${graph.stats.edgeCount} edges${exclusionNote}`,
		);
	}

	/** Re-index full feed when Include tests toggles (preserves expanded when possible). */
	function reindexWithTestInclusion(): void {
		const prev = deps.getSession();
		if (!prev?.files?.length) {
			deps.setStatus('Load a project to toggle test inclusion.');
			return;
		}
		const includeTests = deps.getIncludeTests();
		const indexed = filterFilesByTestInclusion(prev.files, includeTests);
		if (!indexed.length) {
			deps.setStatus(
				'No files left after excluding tests — turn Include tests back on.',
			);
			return;
		}
		const prevStart = prev.startId;
		const prevExpanded = new Set(prev.expanded);
		const prevWarnings = prev.warnings;
		deps.setStatus(
			includeTests
				? `Re-indexing with tests (${indexed.length} files)…`
				: `Re-indexing without tests (${indexed.length} files)…`,
		);
		const { graph, catalog: cat } = indexFiles(indexed);
		const startId =
			prevStart && graph.files.has(prevStart)
				? prevStart
				: (cat.starts[0]?.id ?? null);
		// Drop expanded dirs that no longer exist under the filtered tree
		const expanded = new Set<string>();
		for (const p of prevExpanded) {
			const still =
				graph.files.has(p) ||
				[...graph.files.keys()].some((f) => f === p || f.startsWith(`${p}/`));
			if (still) expanded.add(p);
		}
		if (!expanded.size) {
			for (const p of expandPathsForFilter([...graph.files.keys()], '')) {
				expanded.add(p);
			}
		}
		const excluded = prev.files.length - indexed.length;
		const exclusionNote =
			!includeTests && excluded > 0 ? ` · tests off (−${excluded})` : '';
		activateSession(
			{
				graph,
				catalog: cat,
				startId,
				warnings: prevWarnings,
				expanded,
				files: prev.files,
			},
			`Indexed ${graph.stats.parseableCount ?? graph.stats.sourceCount} parseable · ${graph.stats.edgeCount} edges${exclusionNote}`,
			{ kind: 'reindex' },
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
			// Apply current include-tests preference to the full stored feed
			const includeTests = deps.getIncludeTests();
			const feed = stored.files;
			const indexed = filterFilesByTestInclusion(feed, includeTests);
			if (!indexed.length) {
				deps.setStatus(
					'Remembered project has no files under current test inclusion — upload again.',
				);
				return false;
			}
			const { graph, catalog: cat } = indexFiles(indexed);
			const startId =
				stored.startId && graph.files.has(stored.startId)
					? stored.startId
					: (cat.starts[0]?.id ?? null);
			const expanded = new Set(stored.expanded);
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
					files: feed,
				},
				`Restored ${graph.stats.sourceCount} sources · ${graph.stats.edgeCount} edges (localStorage)`,
				{
					skipPersist: true,
					restorePrecision: stored.locPrecision,
				},
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
		reindexWithTestInclusion,
	};
}
