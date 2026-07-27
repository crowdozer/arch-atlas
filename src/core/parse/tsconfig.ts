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
