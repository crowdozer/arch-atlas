/**
 * Composable sticky UI preferences (localStorage).
 *
 * - Shared opt-in gate: splash **Remember preferences**
 *   (`arch-atlas:engine-pref-enabled` — stable key; also gates engine prefs)
 * - Projection / chrome controls: register via {@link defineControlPref};
 *   all slots share one JSON map under {@link CONTROL_PREFS_KEY}
 *
 * Does not store sessions, source, or multi-MB engines.
 */

/** Shared with engine precision map; keep key for existing installs. */
export const PREFS_ENABLED_KEY = 'arch-atlas:engine-pref-enabled';
export const CONTROL_PREFS_KEY = 'arch-atlas:control-prefs:v1';

/** @deprecated alias — same key as {@link PREFS_ENABLED_KEY} */
export const ENGINE_PREF_ENABLED_KEY = PREFS_ENABLED_KEY;

export type ControlPrefDef<T> = {
	/** Stable id in the control-prefs JSON map. */
	id: string;
	/**
	 * Parse a stored value. Return `undefined` when missing/invalid so
	 * callers can fall through to product defaults without writing junk.
	 */
	parse: (raw: unknown) => T | undefined;
	/** Product default when nothing valid is stored. */
	default: T;
};

export type ControlPrefHandle<T> = {
	readonly id: string;
	readonly default: T;
	/** Stored value if present and valid; else default. */
	read: () => T;
	/** Stored value only; `undefined` when missing/invalid. */
	peek: () => T | undefined;
	/** Persist when prefs are enabled; no-op when disabled or storage blocked. */
	write: (value: T) => void;
};

type AnyDef = ControlPrefDef<unknown>;

const registry = new Map<string, AnyDef>();

/** Preference defaults on when unset. */
export function readPrefsEnabled(): boolean {
	try {
		const raw = localStorage.getItem(PREFS_ENABLED_KEY);
		if (raw === null) return true;
		return raw === '1' || raw === 'true';
	} catch {
		return true;
	}
}

export function writePrefsEnabled(on: boolean): void {
	try {
		localStorage.setItem(PREFS_ENABLED_KEY, on ? '1' : '0');
	} catch {
		/* private mode / blocked storage */
	}
}

/** @deprecated aliases for engine-pref call sites / tests */
export const readEnginePrefEnabled = readPrefsEnabled;
export const writeEnginePrefEnabled = writePrefsEnabled;

function readControlMap(): Record<string, unknown> {
	try {
		const raw = localStorage.getItem(CONTROL_PREFS_KEY);
		if (!raw) return {};
		const data = JSON.parse(raw) as unknown;
		if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
		return data as Record<string, unknown>;
	} catch {
		return {};
	}
}

function writeControlMap(map: Record<string, unknown>): void {
	try {
		localStorage.setItem(CONTROL_PREFS_KEY, JSON.stringify(map));
	} catch {
		/* private mode / blocked storage */
	}
}

/**
 * Register a sticky control slot. Future projection-bar (or other) controls
 * call this once and use the returned handle for read/write.
 *
 * Ids must be unique across the app; duplicate registration throws.
 */
export function defineControlPref<T>(def: ControlPrefDef<T>): ControlPrefHandle<T> {
	if (registry.has(def.id)) {
		throw new Error(`defineControlPref: duplicate id "${def.id}"`);
	}
	registry.set(def.id, def as AnyDef);

	return {
		id: def.id,
		default: def.default,
		read() {
			const parsed = def.parse(readControlMap()[def.id]);
			return parsed !== undefined ? parsed : def.default;
		},
		peek() {
			return def.parse(readControlMap()[def.id]);
		},
		write(value: T) {
			if (!readPrefsEnabled()) return;
			const map = readControlMap();
			map[def.id] = value as unknown;
			writeControlMap(map);
		},
	};
}

/** Test / reset helper: drop all registered slots (does not clear storage). */
export function clearControlPrefRegistryForTests(): void {
	registry.clear();
}

/** Ids currently registered (stable insertion order). */
export function listRegisteredControlPrefIds(): string[] {
	return [...registry.keys()];
}
