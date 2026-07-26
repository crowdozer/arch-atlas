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

export function isSourceFile(path: string): boolean {
	return /\.(m?[jt]sx?|cjs|mjs)$/i.test(path);
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
