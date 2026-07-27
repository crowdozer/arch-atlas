/**
 * Browser localStorage session persistence (opt-in via upload checkbox).
 * Stores virtual files + UI state; re-index on restore keeps catalog consistent.
 */
import type { CodeGraph, MapCatalog, VirtualFile } from '@core/graph/types.ts';

export const PERSIST_PREF_KEY = 'arch-atlas:persist';
export const SESSION_KEY = 'arch-atlas:session:v1';

/** Precision chrome to remember across boot (optional field; older blobs omit). */
export type PersistedLocPrecision = 'estimate' | 'exact' | 'program';

const LOC_PRECISIONS: readonly PersistedLocPrecision[] = [
	'estimate',
	'exact',
	'program',
];

export function parsePersistedLocPrecision(
	raw: unknown,
): PersistedLocPrecision | undefined {
	return typeof raw === 'string' &&
		(LOC_PRECISIONS as string[]).includes(raw)
		? (raw as PersistedLocPrecision)
		: undefined;
}

export type SessionSnapshot = {
	graph: CodeGraph;
	catalog: MapCatalog;
	startId: string | null;
	warnings: string[];
	expanded: Set<string>;
	/**
	 * Full host feed when known (includes tests even if currently filtered from
	 * the graph). Prefer this over reconstructing from graph.contents so a later
	 * re-include can restore test paths.
	 */
	files?: VirtualFile[];
	/** Precision dropdown chrome when known (host app state). */
	locPrecision?: PersistedLocPrecision;
};

export type PersistedSessionV1 = {
	v: 1;
	files: VirtualFile[];
	startId: string | null;
	expanded: string[];
	warnings: string[];
	savedAt: number;
	/** Optional: older sessions omit → restore as estimate (+ auto Exact local). */
	locPrecision?: PersistedLocPrecision;
};

/** Preference defaults on when unset. */
export function readPersistPreference(): boolean {
	try {
		const raw = localStorage.getItem(PERSIST_PREF_KEY);
		if (raw === null) return true;
		return raw === '1' || raw === 'true';
	} catch {
		return true;
	}
}

export function writePersistPreference(on: boolean): void {
	try {
		localStorage.setItem(PERSIST_PREF_KEY, on ? '1' : '0');
	} catch {
		/* private mode / blocked storage */
	}
}

/** Build storable payload from live session (source + config text). */
export function encodeSession(session: SessionSnapshot): PersistedSessionV1 {
	let files: VirtualFile[];
	if (session.files?.length) {
		// Full feed (pre test-filter) so restore can re-apply inclusion prefs
		files = session.files.map((f) => ({
			path: f.path,
			content: f.content,
			byteLength: f.byteLength,
		}));
	} else {
		files = [];
		for (const [path, content] of session.graph.contents) {
			const node = session.graph.files.get(path);
			files.push({
				path,
				content,
				byteLength: node?.byteLength ?? new TextEncoder().encode(content).length,
			});
		}
	}
	// Stable order for smaller diffs / easier debugging
	files.sort((a, b) => a.path.localeCompare(b.path));
	const out: PersistedSessionV1 = {
		v: 1,
		files,
		startId: session.startId,
		expanded: [...session.expanded].sort(),
		warnings: [...session.warnings],
		savedAt: Date.now(),
	};
	if (session.locPrecision) out.locPrecision = session.locPrecision;
	return out;
}

export function parsePersistedSession(raw: string): PersistedSessionV1 | null {
	try {
		const data = JSON.parse(raw) as unknown;
		if (!data || typeof data !== 'object') return null;
		const o = data as Record<string, unknown>;
		if (o.v !== 1 || !Array.isArray(o.files)) return null;
		const files: VirtualFile[] = [];
		for (const f of o.files) {
			if (!f || typeof f !== 'object') continue;
			const row = f as Record<string, unknown>;
			if (typeof row.path !== 'string' || typeof row.content !== 'string') continue;
			files.push({
				path: row.path,
				content: row.content,
				byteLength:
					typeof row.byteLength === 'number'
						? row.byteLength
						: new TextEncoder().encode(row.content).length,
			});
		}
		if (!files.length) return null;
		const locPrecision = parsePersistedLocPrecision(o.locPrecision);
		return {
			v: 1,
			files,
			startId: typeof o.startId === 'string' ? o.startId : null,
			expanded: Array.isArray(o.expanded)
				? o.expanded.filter((x): x is string => typeof x === 'string')
				: [],
			warnings: Array.isArray(o.warnings)
				? o.warnings.filter((x): x is string => typeof x === 'string')
				: [],
			savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0,
			...(locPrecision ? { locPrecision } : {}),
		};
	} catch {
		return null;
	}
}

export function loadPersistedSession(): PersistedSessionV1 | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		return parsePersistedSession(raw);
	} catch {
		return null;
	}
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

export function savePersistedSession(session: SessionSnapshot): SaveResult {
	try {
		const payload = encodeSession(session);
		const json = JSON.stringify(payload);
		localStorage.setItem(SESSION_KEY, json);
		return { ok: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const quota =
			err instanceof DOMException &&
			(err.name === 'QuotaExceededError' || err.code === 22);
		return {
			ok: false,
			reason: quota
				? 'localStorage full — session not saved (try a smaller ZIP or turn off remember).'
				: `Could not save session: ${msg}`,
		};
	}
}

export function clearPersistedSession(): void {
	try {
		localStorage.removeItem(SESSION_KEY);
	} catch {
		/* ignore */
	}
}
