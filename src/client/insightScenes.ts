/**
 * Engine insight scenes — Artillery-style shareable presets.
 *
 * Product catalog is empty (triage packets 1A–2B closed). Underlying support
 * stays: types, `?scene=` parse, gallery bind hooks, open recipes, and
 * fixture load. Re-register entries in {@link INSIGHT_SCENES} (and matching
 * `import.meta.glob` loaders) when shipping new presets.
 *
 * Load via `/?scene=<id>` (or gallery cards with `data-scene` / `atlas-scene-*`).
 */
import type { VirtualFile } from '@core/graph/types.ts';
import type { WeightAxis } from '@core/view/weight.ts';
import type { AtlasView } from '@shell/atlasView.ts';

/** Catalog id (open string; validity is {@link isSceneId}). */
export type SceneId = string;

/** Where to land after indexing the fixture. */
export type SceneOpen =
	| {
			kind: 'file-hub';
			fileId: string;
			/** Optional hub radius override. */
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
			/** File-hub radius before package open. */
			maxDepth?: number;
			weightAxis?: WeightAxis;
	  };

export type InsightScene = {
	id: SceneId;
	label: string;
	/** One-line gallery blurb. */
	description: string;
	/** Optional triage / packet label for status chrome. */
	triagePacket: string;
	/** What to inspect when the scene loads. */
	lookFor: string;
	/** Expected correct outcome (docs / status). */
	expectAfterFix: string;
	open: SceneOpen;
	/**
	 * Relative path prefixes stamped `toKind: 'omitted'` when the target is
	 * missing from the feed.
	 */
	omitPathPrefixes?: string[];
};

/**
 * Active product catalog. Empty after engine-triage closeout.
 *
 * To re-enable a scene: push an {@link InsightScene} here and register its
 * fixture under {@link SCENE_FIXTURE_GLOBS} (Vite `import.meta.glob` must be
 * static — add a new eager glob entry when adding a fixture dir).
 */
export const INSIGHT_SCENES: readonly InsightScene[] = [];

const BY_ID = new Map(INSIGHT_SCENES.map((s) => [s.id, s]));

export function isSceneId(raw: string | null | undefined): raw is SceneId {
	return typeof raw === 'string' && BY_ID.has(raw);
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
// Catalog empty: no globs registered. Re-add with e.g.:
//   const scarceModules = import.meta.glob(
//     '../../fixtures/scene-scarce-fanout/**/*',
//     { query: '?raw', import: 'default', eager: true },
//   ) as Record<string, string>;
// and map id → { modules, marker: 'fixtures/scene-scarce-fanout/' }.

const SCENE_FIXTURE_GLOBS: Record<
	string,
	{ modules: Record<string, string>; marker: string }
> = {};

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
	const entry = SCENE_FIXTURE_GLOBS[id];
	if (!entry) {
		throw new Error(
			`Scene "${id}" has no fixture loader — register import.meta.glob in insightScenes.ts`,
		);
	}
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
