/**
 * Engine insight scenes — Artillery-style shareable presets for triage bugs.
 *
 * Load via `/?scene=<id>` (or gallery cards on the upload step). Each scene is a
 * minimal synthetic fixture that opens on the view where the defect is visible.
 *
 * These do **not** fix geometry; they make known failures one-click reproducible
 * for browser inspection and later E2E. See catalog
 * `alluvial-engine-correctness-triage` Pre-phase 0.
 */
import type { VirtualFile } from '@core/graph/types.ts';
import type { WeightAxis } from '@core/view/weight.ts';
import type { AtlasView } from '@shell/atlasView.ts';

export type SceneId =
	| 'scarce-fanout'
	| 'cyclic-depth'
	| 'label-collision'
	| 'sticky-package'
	| 'omitted-ends';

/** Where to land after indexing the fixture. */
export type SceneOpen =
	| {
			kind: 'file-hub';
			fileId: string;
			/** Optional hub radius override (cyclic-depth wants ≥3). */
			maxDepth?: number;
			weightAxis?: WeightAxis;
	  }
	| {
			kind: 'module';
			moduleId: string;
			weightAxis?: WeightAxis;
	  }
	| {
			/** Open file-hub first, then package-hub with the painted package label. */
			kind: 'package-hub-via-file';
			fileId: string;
			packageId: string;
			/** File-hub radius before package open (1 = module collapse / collision). */
			maxDepth?: number;
			weightAxis?: WeightAxis;
	  };

export type InsightScene = {
	id: SceneId;
	label: string;
	/** One-line gallery blurb. */
	description: string;
	/** Triage packet that will close this (1A, 1B, 2A, 2B, …). */
	triagePacket: string;
	/** What wrong looks like today (status / warnings). */
	lookFor: string;
	/** What correct should look like after the repair ship. */
	expectAfterFix: string;
	open: SceneOpen;
	/**
	 * Relative path prefixes stamped `toKind: 'omitted'` when the target is
	 * missing from the feed (omitted-ends scene).
	 */
	omitPathPrefixes?: string[];
};

export const INSIGHT_SCENES: readonly InsightScene[] = [
	{
		id: 'scarce-fanout',
		label: 'Scarce fan-out',
		description:
			'Unit-mass parent fans to two children — integer split drops a branch.',
		triagePacket: '1B',
		lookFor:
			'Fixed (1B): root→a unit mass; both b and c on Import hop 2 with positive fractional shares.',
		expectAfterFix:
			'Both b and c present as uncapped dependency branches with positive shares.',
		open: {
			kind: 'file-hub',
			// Focus root so a arrives with mass 1 and fans out under integer split
			fileId: 'src/root.ts',
			maxDepth: 3,
			weightAxis: 'import-edges',
		},
	},
	{
		id: 'cyclic-depth',
		label: 'Cyclic depth',
		description:
			'Diamond + cycle under-reports longest simple path; hop for c collapses.',
		triagePacket: '1A',
		lookFor:
			'Fixed (1A+1B): longest path to c is 3; hub shows c on import hops with positive ribbons.',
		expectAfterFix:
			'c reachable as a depth-3 instance with positive ribbon.',
		open: {
			kind: 'file-hub',
			fileId: 'src/root.ts',
			maxDepth: 4,
			weightAxis: 'import-edges',
		},
	},
	{
		id: 'label-collision',
		label: 'Label collision',
		description:
			'Module folder `react` imports package `react` — display name overwrites identity.',
		triagePacket: '2A',
		lookFor:
			'Broken: module view may self-link react→react or overwrite the module node kind.',
		expectAfterFix:
			'Module and package keep distinct claimed labels; nodeRef ids stay stable.',
		open: {
			kind: 'module',
			moduleId: 'react',
		},
	},
	{
		id: 'sticky-package',
		label: 'Sticky package label',
		description:
			'Module leaf `react` + package `react` → painted `react · package` sticky fails remount.',
		triagePacket: '2B',
		lookFor:
			'Broken: package-hub opens fully dimmed / sticky seed matches zero bands (painted `react · package` vs raw `react`).',
		expectAfterFix:
			'Sticky package focus restores via stable package id; at least one focused band.',
		open: {
			kind: 'package-hub-via-file',
			fileId: 'app.ts',
			packageId: 'react',
			// depth=1 triggers module collapse so Exports claims "react" first
			maxDepth: 1,
			weightAxis: 'import-edges',
		},
	},
	{
		id: 'omitted-ends',
		label: 'Omitted ends leak',
		description:
			'Feed-omitted relative import leaks into module package ends.',
		triagePacket: '2A',
		lookFor:
			'Broken: module `src` ends include the omitted `./hidden` target as an architecture end.',
		expectAfterFix:
			'Omitted edges never appear as module/package architecture ends (catalog already excludes them).',
		open: {
			kind: 'module',
			moduleId: 'src',
		},
		omitPathPrefixes: ['src/hidden'],
	},
] as const;

const BY_ID = new Map(INSIGHT_SCENES.map((s) => [s.id, s]));

export function isSceneId(raw: string | null | undefined): raw is SceneId {
	return typeof raw === 'string' && BY_ID.has(raw as SceneId);
}

export function getInsightScene(id: SceneId): InsightScene {
	const s = BY_ID.get(id);
	if (!s) throw new Error(`Unknown insight scene: ${id}`);
	return s;
}

export function listInsightScenes(): readonly InsightScene[] {
	return INSIGHT_SCENES;
}

/** Parse `?scene=` from a search string (location.search). */
export function parseSceneQuery(search: string): SceneId | null {
	const q = search.startsWith('?') ? search.slice(1) : search;
	const params = new URLSearchParams(q);
	const raw = params.get('scene')?.trim() ?? '';
	return isSceneId(raw) ? raw : null;
}

/** Shareable href for the app root. */
export function sceneHref(id: SceneId): string {
	return `/?scene=${id}`;
}

// ── Fixture globs (Vite raw, same pattern as demoFixtures) ───────────────────

const scarceModules = import.meta.glob(
	'../../fixtures/scene-scarce-fanout/**/*',
	{ query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const cyclicModules = import.meta.glob(
	'../../fixtures/scene-cyclic-depth/**/*',
	{ query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const labelModules = import.meta.glob(
	'../../fixtures/scene-label-collision/**/*',
	{ query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const stickyModules = import.meta.glob(
	'../../fixtures/scene-sticky-package/**/*',
	{ query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const omittedModules = import.meta.glob(
	'../../fixtures/scene-omitted-ends/**/*',
	{ query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const GLOBS: Record<
	SceneId,
	{ modules: Record<string, string>; marker: string }
> = {
	'scarce-fanout': {
		modules: scarceModules,
		marker: 'fixtures/scene-scarce-fanout/',
	},
	'cyclic-depth': {
		modules: cyclicModules,
		marker: 'fixtures/scene-cyclic-depth/',
	},
	'label-collision': {
		modules: labelModules,
		marker: 'fixtures/scene-label-collision/',
	},
	'sticky-package': {
		modules: stickyModules,
		marker: 'fixtures/scene-sticky-package/',
	},
	'omitted-ends': {
		modules: omittedModules,
		marker: 'fixtures/scene-omitted-ends/',
	},
};

function toVirtualFiles(
	modules: Record<string, string>,
	marker: string,
): VirtualFile[] {
	const encoder = new TextEncoder();
	const files: VirtualFile[] = [];
	for (const [key, content] of Object.entries(modules)) {
		const normalizedKey = key.replace(/\\/g, '/');
		const idx = normalizedKey.lastIndexOf(marker);
		if (idx < 0) continue;
		const path = normalizedKey.slice(idx + marker.length);
		if (!path || path.endsWith('/')) continue;
		if (typeof content !== 'string') continue;
		files.push({
			path,
			content,
			byteLength: encoder.encode(content).length,
		});
	}
	files.sort((a, b) => a.path.localeCompare(b.path));
	return files;
}

/** Load scene fixture as VirtualFile[] (same shape as ZIP / demo ingest). */
export function loadSceneFiles(id: SceneId): VirtualFile[] {
	const entry = GLOBS[id];
	if (!entry) throw new Error(`Unknown scene: ${id}`);
	const files = toVirtualFiles(entry.modules, entry.marker);
	if (!files.length) {
		throw new Error(
			`Scene "${id}" produced zero files — check fixture paths / glob.`,
		);
	}
	return files;
}

/** Matcher for {@link indexHostFeed} when scene declares omit prefixes. */
export function sceneOmitMatcher(
	prefixes: string[] | undefined,
): ((path: string) => boolean) | undefined {
	if (!prefixes?.length) return undefined;
	const norms = prefixes.map((p) => p.replace(/\\/g, '/').replace(/^\//, ''));
	return (path: string) => {
		const n = path.replace(/\\/g, '/').replace(/^\//, '');
		return norms.some(
			(p) => n === p || n.startsWith(`${p}.`) || n.startsWith(`${p}/`),
		);
	};
}

/** AtlasView for simple file/module opens (package-hub needs host sticky). */
export function scenePrimaryView(open: SceneOpen): AtlasView | null {
	if (open.kind === 'file-hub') {
		return { type: 'file-hub', fileId: open.fileId };
	}
	if (open.kind === 'module') {
		return { type: 'module', moduleId: open.moduleId };
	}
	// package-hub-via-file: host opens file then package
	return { type: 'file-hub', fileId: open.fileId };
}
