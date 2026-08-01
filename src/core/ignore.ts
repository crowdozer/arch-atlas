/**
 * Default path segments ignored when indexing an uploaded repository.
 * Level-1: skip vendored, build, and VCS noise.
 */

const IGNORED_SEGMENTS = new Set([
	'node_modules',
	'.git',
	'.svn',
	'.hg',
	'dist',
	'build',
	'out',
	'coverage',
	'.next',
	'.nuxt',
	'.output',
	'.turbo',
	'.cache',
	'.vercel',
	'.astro',
	'__pycache__',
	'.venv',
	'venv',
	'target', // rust etc. if mixed zip
]);

const IGNORED_BASENAMES = new Set([
	'.DS_Store',
	'Thumbs.db',
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
	'bun.lockb',
	'bun.lock',
]);

/** Normalize zip entry paths to POSIX without leading slash. */
export function normalizePath(raw: string): string {
	return raw
		.replace(/\\/g, '/')
		.replace(/^\.?\//, '')
		.replace(/\/+/g, '/')
		.replace(/\/$/, '');
}

export function shouldIgnorePath(path: string): boolean {
	const p = normalizePath(path);
	if (!p || p.endsWith('/')) return true;
	const parts = p.split('/');
	for (const seg of parts) {
		if (IGNORED_SEGMENTS.has(seg)) return true;
	}
	const base = parts[parts.length - 1] ?? '';
	if (IGNORED_BASENAMES.has(base)) return true;
	// skip binary-ish extensions
	if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|mp4|zip|gz|br|wasm|map)$/i.test(base)) {
		return true;
	}
	return false;
}

/** JS/TS sources only (classic Level-1 family; Exact export-surface path). */
export function isSourceFile(path: string): boolean {
	return /\.(m?[jt]sx?|cjs|mjs)$/i.test(path);
}

/** Python sources (Level-1 import-parseable; Exact engine still missing). */
export function isPythonSourceFile(path: string): boolean {
	return /\.py$/i.test(path);
}

/**
 * Astro SFCs (Level-1 import-parseable via frontmatter / script islands).
 * Exact: script-island surface only when a host maps islands - not full SFC LSP.
 */
export function isAstroSourceFile(path: string): boolean {
	return /\.astro$/i.test(path);
}

/**
 * Heuristic: path looks like a unit/integration test (or colocated mock).
 * Used by the web host inclusion toggle - **not** applied by CLI unless a host
 * opts in. Does not treat bare `test/` product folders as tests.
 */
export function isTestPath(path: string): boolean {
	const p = normalizePath(path);
	if (!p) return false;
	const parts = p.split('/');
	for (const seg of parts) {
		if (seg === '__tests__' || seg === '__mocks__') return true;
	}
	const base = parts[parts.length - 1] ?? '';
	// foo.test.ts, foo.spec.tsx, foo.e2e.test.ts, foo.test.mts, …
	if (/\.(?:test|spec)(?:\.[^.]+)*\.[cm]?[jt]sx?$/i.test(base)) return true;
	if (/\.e2e\.[cm]?[jt]sx?$/i.test(base)) return true;
	return false;
}

/**
 * When `includeTests` is false, drop paths matching {@link isTestPath}.
 * Default include (true) is identity - CLI / existing callers stay unchanged.
 */
export function filterFilesByTestInclusion<T extends { path: string }>(
	files: readonly T[],
	includeTests: boolean,
): T[] {
	if (includeTests) return [...files];
	return files.filter((f) => !isTestPath(f.path));
}

export function isConfigFile(path: string): boolean {
	const base = path.split('/').pop() ?? '';
	return (
		base === 'package.json' ||
		base === 'tsconfig.json' ||
		base === 'jsconfig.json' ||
		/^tsconfig\..+\.json$/.test(base)
	);
}
