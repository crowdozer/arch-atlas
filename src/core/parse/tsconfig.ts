/**
 * Best-effort tsconfig/jsconfig paths for Level-1 module resolution.
 */

import { stripComments } from '@core/parse/imports.ts';

export type PathAliasConfig = {
	baseUrl: string; // directory containing tsconfig, or baseUrl relative to it
	/** alias pattern → target patterns (relative to baseUrl) */
	paths: Array<{ pattern: string; targets: string[] }>;
};

export function parseTsconfigPaths(
	jsonText: string,
	configDir: string,
): PathAliasConfig | null {
	let data: unknown;
	try {
		// String-safe comment strip (preserves "@/*" path keys and "**/*" globs),
		// then tolerate trailing commas common in user tsconfigs.
		const cleaned = stripComments(jsonText).replace(/,\s*([\]}])/g, '$1');
		data = JSON.parse(cleaned);
	} catch {
		return null;
	}
	if (!data || typeof data !== 'object') return null;
	const compilerOptions = (data as { compilerOptions?: unknown }).compilerOptions;
	if (!compilerOptions || typeof compilerOptions !== 'object') {
		return { baseUrl: configDir, paths: [] };
	}
	const opts = compilerOptions as {
		baseUrl?: unknown;
		paths?: unknown;
	};
	const baseUrlRel =
		typeof opts.baseUrl === 'string' && opts.baseUrl ? opts.baseUrl : '.';
	const baseUrl = joinPosix(configDir, baseUrlRel);

	const paths: PathAliasConfig['paths'] = [];
	if (opts.paths && typeof opts.paths === 'object' && !Array.isArray(opts.paths)) {
		for (const [pattern, targets] of Object.entries(
			opts.paths as Record<string, unknown>,
		)) {
			if (!Array.isArray(targets)) continue;
			const t = targets.filter((x): x is string => typeof x === 'string');
			if (t.length) paths.push({ pattern, targets: t });
		}
	}
	return { baseUrl, paths };
}

/**
 * Pick the first usable tsconfig/jsconfig paths config from a virtual file map.
 * Same candidate order as graph build (root names first, then any nested
 * tsconfig.json / jsconfig.json). Single owner for L2 resolve + honesty stamp.
 */
export function pickAliasConfig(
	files: ReadonlyMap<string, string>,
): PathAliasConfig | null {
	const candidates = [
		'tsconfig.json',
		'jsconfig.json',
		'tsconfig.app.json',
		'tsconfig.base.json',
	];
	for (const name of candidates) {
		// prefer root or first match
		const exact = files.get(name);
		if (exact) {
			const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
			const cfg = parseTsconfigPaths(exact, dir);
			if (cfg) return cfg;
		}
	}
	for (const [path, text] of files) {
		const base = path.split('/').pop() ?? '';
		if (base === 'tsconfig.json' || base === 'jsconfig.json') {
			const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
			const cfg = parseTsconfigPaths(text, dir);
			if (cfg) return cfg;
		}
	}
	return null;
}

export function joinPosix(a: string, b: string): string {
	if (!a || a === '.') return b.replace(/^\.\//, '');
	if (!b || b === '.') return a;
	if (b.startsWith('/')) return b.replace(/^\//, '');
	const left = a.replace(/\/$/, '');
	const right = b.replace(/^\.\//, '');
	const parts = `${left}/${right}`.split('/');
	const stack: string[] = [];
	for (const p of parts) {
		if (!p || p === '.') continue;
		if (p === '..') {
			stack.pop();
			continue;
		}
		stack.push(p);
	}
	return stack.join('/');
}

/**
 * Merge path-alias entries. Later entries win on the same pattern.
 * Used to apply CLI `--alias` rewrites over tsconfig paths.
 */
export function mergePathAliases(
	base: PathAliasConfig | null,
	extra:
		| PathAliasConfig
		| Array<{ pattern: string; targets: string[] }>
		| null
		| undefined,
): PathAliasConfig | null {
	if (!extra) return base;
	const extraPaths = Array.isArray(extra)
		? extra
		: extra.paths;
	const baseUrl =
		(!Array.isArray(extra) && extra.baseUrl) || base?.baseUrl || '';
	const byPattern = new Map<string, string[]>();
	for (const p of base?.paths ?? []) {
		byPattern.set(p.pattern, [...p.targets]);
	}
	for (const p of extraPaths) {
		if (!p.pattern || !p.targets?.length) continue;
		// Rewrites win on the same pattern
		byPattern.set(p.pattern, [...p.targets]);
	}
	const paths = [...byPattern.entries()].map(([pattern, targets]) => ({
		pattern,
		targets,
	}));
	if (!paths.length && !baseUrl) return base;
	return { baseUrl, paths };
}

/**
 * Parse a single CLI `--alias PATTERN=TARGET` value into a paths entry.
 * TARGET may be comma-separated for multiple targets.
 * Returns null when the form is invalid (no `=` or empty sides).
 */
export function parseAliasFlag(raw: string): { pattern: string; targets: string[] } | null {
	const eq = raw.indexOf('=');
	if (eq <= 0) return null;
	const pattern = raw.slice(0, eq).trim();
	const targetPart = raw.slice(eq + 1).trim();
	if (!pattern || !targetPart) return null;
	const targets = targetPart
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	if (!targets.length) return null;
	return { pattern, targets };
}

/**
 * Apply path aliases. Returns candidate relative paths (no extension).
 */
export function expandAlias(
	specifier: string,
	config: PathAliasConfig | null,
): string[] {
	if (!config || !config.paths.length) {
		if (config?.baseUrl && !specifier.startsWith('.')) {
			// bare might still be baseUrl-relative non-package (rare)
		}
		return [];
	}

	const out: string[] = [];
	for (const { pattern, targets } of config.paths) {
		const star = pattern.indexOf('*');
		if (star === -1) {
			if (specifier === pattern) {
				for (const t of targets) {
					out.push(joinPosix(config.baseUrl, t.replace(/\*$/, '')));
				}
			}
			continue;
		}
		const prefix = pattern.slice(0, star);
		const suffix = pattern.slice(star + 1);
		if (!specifier.startsWith(prefix)) continue;
		if (suffix && !specifier.endsWith(suffix)) continue;
		const mid = specifier.slice(prefix.length, specifier.length - suffix.length);
		for (const t of targets) {
			const tStar = t.indexOf('*');
			const mapped =
				tStar === -1 ? t : t.slice(0, tStar) + mid + t.slice(tStar + 1);
			out.push(joinPosix(config.baseUrl, mapped));
		}
	}
	return out;
}
