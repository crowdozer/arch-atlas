/**
 * Real TypeScript `createProgram` over a feed VFS (CLI / host-shared Exact layer).
 *
 * Distinct from `tsProgramProvider` (createSourceFile export spans only) -
 * this builds a CompilerHost + Program for L2 module resolution and thin L3
 * export-symbol counts. Not pure core (may read default lib from disk).
 *
 * Honesty: incomplete without node_modules / full project references; not LSP.
 */

import type { TypescriptModule } from './tsProgramProvider.ts';

/** Virtual root prefix for feed paths inside the Program host. */
export const FEED_VIRTUAL_ROOT = '/' as const;

const JS_TS_ROOT_EXT = /\.(m?[jt]sx?|c[jt]s)$/i;

/** Minimal classic TS surface needed for createProgram + resolveModuleName. */
export type ProgramTypescriptModule = TypescriptModule & {
	createProgram: (
		rootNames: readonly string[],
		options: Record<string, unknown>,
		host?: unknown,
	) => TsProgram;
	resolveModuleName: (
		moduleName: string,
		containingFile: string,
		compilerOptions: Record<string, unknown>,
		host: TsModuleResolutionHost,
	) => { resolvedModule?: { resolvedFileName?: string } | undefined };
	createSourceFile: NonNullable<TypescriptModule['createSourceFile']>;
	getDefaultLibFileName?: (options: Record<string, unknown>) => string;
	getDefaultLibFilePath?: (options: Record<string, unknown>) => string;
	sys?: {
		readFile?(path: string): string | undefined;
		fileExists?(path: string): boolean;
		directoryExists?(path: string): boolean;
		getCurrentDirectory?(): string;
		getDirectories?(path: string): string[];
		realpath?(path: string): string;
	};
	ScriptTarget?: { Latest?: number; ESNext?: number; [k: string]: unknown };
	ModuleKind?: { ESNext?: number; NodeNext?: number; [k: string]: unknown };
	ModuleResolutionKind?: {
		Bundler?: number;
		NodeNext?: number;
		Node16?: number;
		NodeJs?: number;
		[k: string]: unknown;
	};
	parseConfigFileTextToJson?: (
		fileName: string,
		jsonText: string,
	) => { config?: unknown; error?: unknown };
	parseJsonConfigFileContent?: (
		json: unknown,
		host: unknown,
		basePath: string,
		existingOptions?: unknown,
		configFileName?: string,
	) => {
		options: Record<string, unknown>;
		errors: readonly unknown[];
		fileNames?: string[];
	};
	getPreEmitDiagnostics?: (program: TsProgram) => readonly unknown[];
};

export type TsModuleResolutionHost = {
	fileExists(fileName: string): boolean;
	readFile(fileName: string): string | undefined;
	directoryExists?(directoryName: string): boolean;
	getCurrentDirectory?(): string;
	getDirectories?(path: string): string[];
	realpath?(path: string): string;
};

export type TsProgram = {
	getSourceFiles(): readonly { fileName: string; text?: string; symbol?: unknown }[];
	getSourceFile(fileName: string):
		| { fileName: string; text?: string; symbol?: unknown }
		| undefined;
	getTypeChecker(): {
		getSymbolAtLocation?(node: unknown): unknown;
		getExportsOfModule?(symbol: unknown): readonly { getName?(): string; escapedName?: string | number }[];
	};
	getCompilerOptions(): Record<string, unknown>;
	getSemanticDiagnostics?(): readonly unknown[];
	getSyntacticDiagnostics?(): readonly unknown[];
};

export type CreateFeedProgramOpts = {
	/**
	 * Extra compiler option overrides (merged after tsconfig / defaults).
	 */
	compilerOptions?: Record<string, unknown>;
	/**
	 * When true, skip reading default lib from disk (tests).
	 * Resolution still works; checker may be incomplete.
	 */
	skipDefaultLib?: boolean;
};

export type FeedProgramCompleteness = {
	tsconfig: 'none' | 'partial' | 'full';
	/** Absolute or package paths we failed to load (e.g. default lib). */
	missingLibs: string[];
	/** Root names passed to createProgram. */
	rootFileCount: number;
};

export type CreateFeedProgramResult = {
	program: TsProgram;
	host: TsModuleResolutionHost & {
		getSourceFile: (
			fileName: string,
			languageVersion: number,
			onError?: (msg: string) => void,
		) => unknown;
		getDefaultLibFileName: (options: Record<string, unknown>) => string;
		writeFile: () => void;
		getCurrentDirectory: () => string;
		getCanonicalFileName: (f: string) => string;
		useCaseSensitiveFileNames: () => boolean;
		getNewLine: () => string;
		getDirectories: (path: string) => string[];
	};
	/** Virtual absolute paths used as Program roots. */
	rootFiles: string[];
	compilerOptions: Record<string, unknown>;
	/** Feed-relative path ↔ virtual path helpers. */
	toVirtual: (feedPath: string) => string;
	fromVirtual: (virtualPath: string) => string;
	/** Normalized feed map (posix relative keys, no leading slash). */
	feedFiles: ReadonlyMap<string, string>;
	/** Virtual absolute map (leading `/`). */
	virtualFiles: ReadonlyMap<string, string>;
	completeness: FeedProgramCompleteness;
	diagnostics: readonly unknown[];
};

/**
 * True when module exposes real createProgram + resolveModuleName (not span-only).
 */
export function isProgramTypescriptModule(
	ts: unknown,
): ts is ProgramTypescriptModule {
	if (!ts || typeof ts !== 'object') return false;
	const m = ts as ProgramTypescriptModule;
	return (
		typeof m.createProgram === 'function' &&
		typeof m.resolveModuleName === 'function' &&
		typeof m.createSourceFile === 'function'
	);
}

/** Normalize feed path: posix, strip leading `./` and `/`. */
export function normalizeFeedPath(path: string): string {
	let p = path.replace(/\\/g, '/').replace(/^\.\//, '');
	while (p.startsWith('/')) p = p.slice(1);
	return p;
}

export function toVirtualPath(feedPath: string): string {
	const n = normalizeFeedPath(feedPath);
	return n ? `${FEED_VIRTUAL_ROOT}${n}` : FEED_VIRTUAL_ROOT;
}

export function fromVirtualPath(virtualPath: string): string {
	let p = virtualPath.replace(/\\/g, '/');
	// Strip file:// if present
	if (p.startsWith('file://')) {
		try {
			p = new URL(p).pathname;
		} catch {
			/* keep */
		}
	}
	if (p.startsWith(FEED_VIRTUAL_ROOT) && p.length > 1) {
		return p.slice(1);
	}
	return normalizeFeedPath(p);
}

function isJsTsRoot(path: string): boolean {
	return JS_TS_ROOT_EXT.test(path);
}

function findTsconfigText(
	feed: ReadonlyMap<string, string>,
): { path: string; text: string } | null {
	// Prefer root tsconfig.json, then jsconfig, then first tsconfig.*.json
	const keys = [...feed.keys()].sort((a, b) => a.localeCompare(b));
	const rootTs = keys.find((k) => k === 'tsconfig.json' || k.endsWith('/tsconfig.json'));
	if (rootTs) return { path: rootTs, text: feed.get(rootTs)! };
	const rootJs = keys.find((k) => k === 'jsconfig.json' || k.endsWith('/jsconfig.json'));
	if (rootJs) return { path: rootJs, text: feed.get(rootJs)! };
	const any = keys.find((k) => {
		const base = k.split('/').pop() ?? '';
		return base === 'tsconfig.json' || /^tsconfig\..+\.json$/.test(base);
	});
	if (any) return { path: any, text: feed.get(any)! };
	return null;
}

function defaultCompilerOptions(ts: ProgramTypescriptModule): Record<string, unknown> {
	const target = ts.ScriptTarget?.Latest ?? ts.ScriptTarget?.ESNext ?? 99;
	const module = ts.ModuleKind?.ESNext ?? 99;
	const moduleResolution =
		ts.ModuleResolutionKind?.Bundler ??
		ts.ModuleResolutionKind?.NodeNext ??
		ts.ModuleResolutionKind?.NodeJs ??
		100;
	return {
		target,
		module,
		moduleResolution,
		allowJs: true,
		noEmit: true,
		esModuleInterop: true,
		allowSyntheticDefaultImports: true,
		skipLibCheck: true,
		baseUrl: FEED_VIRTUAL_ROOT,
	};
}

/**
 * Parse feed tsconfig into compiler options (virtual base path `/`).
 * Soft: returns defaults + completeness when parse fails.
 */
export function compilerOptionsFromFeed(
	ts: ProgramTypescriptModule,
	feed: ReadonlyMap<string, string>,
	overrides?: Record<string, unknown>,
): {
	options: Record<string, unknown>;
	tsconfig: FeedProgramCompleteness['tsconfig'];
	parseErrors: readonly unknown[];
} {
	const defaults = defaultCompilerOptions(ts);
	const found = findTsconfigText(feed);
	if (!found) {
		return {
			options: { ...defaults, ...overrides },
			tsconfig: 'none',
			parseErrors: [],
		};
	}

	if (
		typeof ts.parseConfigFileTextToJson !== 'function' ||
		typeof ts.parseJsonConfigFileContent !== 'function'
	) {
		// Fallback: shallow JSON parse of compilerOptions only
		try {
			const raw = JSON.parse(found.text) as {
				compilerOptions?: Record<string, unknown>;
			};
			const co = raw.compilerOptions ?? {};
			const hasPaths = Boolean(
				co.paths && typeof co.paths === 'object' && Object.keys(co.paths as object).length,
			);
			return {
				options: {
					...defaults,
					...co,
					baseUrl: co.baseUrl
						? // keep relative; createProgram host uses `/` cwd
							co.baseUrl
						: FEED_VIRTUAL_ROOT,
					noEmit: true,
					allowJs: co.allowJs ?? true,
					...overrides,
				},
				tsconfig: hasPaths ? 'full' : 'partial',
				parseErrors: [],
			};
		} catch {
			return {
				options: { ...defaults, ...overrides },
				tsconfig: 'partial',
				parseErrors: [],
			};
		}
	}

	const virtualConfig = toVirtualPath(found.path);
	const json = ts.parseConfigFileTextToJson(virtualConfig, found.text);
	const parseHost = {
		useCaseSensitiveFileNames: true,
		readDirectory: () => [] as string[],
		fileExists: (f: string) => {
			const feedKey = fromVirtualPath(f);
			return feed.has(feedKey) || feed.has(normalizeFeedPath(f));
		},
		readFile: (f: string) => {
			const feedKey = fromVirtualPath(f);
			return feed.get(feedKey) ?? feed.get(normalizeFeedPath(f));
		},
		getCurrentDirectory: () => FEED_VIRTUAL_ROOT,
	};

	try {
		const parsed = ts.parseJsonConfigFileContent(
			json.config,
			parseHost,
			FEED_VIRTUAL_ROOT,
			undefined,
			virtualConfig,
		);
		const hasPaths = Boolean(
			parsed.options.paths &&
				typeof parsed.options.paths === 'object' &&
				Object.keys(parsed.options.paths as object).length,
		);
		return {
			options: {
				...defaults,
				...parsed.options,
				noEmit: true,
				allowJs: parsed.options.allowJs ?? true,
				skipLibCheck: true,
				...overrides,
			},
			tsconfig: hasPaths ? 'full' : 'partial',
			parseErrors: parsed.errors ?? [],
		};
	} catch {
		return {
			options: { ...defaults, ...overrides },
			tsconfig: 'partial',
			parseErrors: [],
		};
	}
}

function buildVirtualMaps(
	input: ReadonlyMap<string, string> | Iterable<{ path: string; content: string }>,
): { feedFiles: Map<string, string>; virtualFiles: Map<string, string> } {
	const feedFiles = new Map<string, string>();
	const virtualFiles = new Map<string, string>();
	if (input instanceof Map) {
		for (const [p, content] of input) {
			const n = normalizeFeedPath(p);
			if (!n) continue;
			feedFiles.set(n, content);
			virtualFiles.set(toVirtualPath(n), content);
		}
	} else {
		for (const f of input) {
			const n = normalizeFeedPath(f.path);
			if (!n) continue;
			feedFiles.set(n, f.content);
			virtualFiles.set(toVirtualPath(n), f.content);
		}
	}
	return { feedFiles, virtualFiles };
}

/**
 * Create a TypeScript Program over feed file contents (virtual FS).
 * Default lib is read from the typescript package via `getDefaultLibFilePath` when available.
 */
export function createFeedProgram(
	files: ReadonlyMap<string, string> | Iterable<{ path: string; content: string }>,
	ts: ProgramTypescriptModule,
	opts: CreateFeedProgramOpts = {},
): CreateFeedProgramResult {
	const { feedFiles, virtualFiles } = buildVirtualMaps(files);
	const { options, tsconfig, parseErrors } = compilerOptionsFromFeed(
		ts,
		feedFiles,
		opts.compilerOptions,
	);

	const missingLibs: string[] = [];
	const target =
		(options.target as number | undefined) ??
		ts.ScriptTarget?.Latest ??
		ts.ScriptTarget?.ESNext ??
		99;

	const readVirtualOrDisk = (fileName: string): string | undefined => {
		const norm = fileName.replace(/\\/g, '/');
		if (virtualFiles.has(norm)) return virtualFiles.get(norm);
		const feedKey = fromVirtualPath(norm);
		if (feedFiles.has(feedKey)) return feedFiles.get(feedKey);
		// Default lib / real disk (typescript package)
		if (opts.skipDefaultLib) return undefined;
		try {
			if (ts.sys?.readFile) {
				const t = ts.sys.readFile(fileName);
				if (t !== undefined) return t;
			}
		} catch {
			/* ignore */
		}
		return undefined;
	};

	const fileExists = (fileName: string): boolean => {
		const norm = fileName.replace(/\\/g, '/');
		if (virtualFiles.has(norm)) return true;
		const feedKey = fromVirtualPath(norm);
		if (feedFiles.has(feedKey)) return true;
		if (opts.skipDefaultLib) return false;
		try {
			if (ts.sys?.fileExists?.(fileName)) return true;
		} catch {
			/* ignore */
		}
		return false;
	};

	const getDefaultLibFileName = (compilerOptions: Record<string, unknown>): string => {
		if (typeof ts.getDefaultLibFilePath === 'function') {
			try {
				return ts.getDefaultLibFilePath(compilerOptions);
			} catch {
				/* fall through */
			}
		}
		if (typeof ts.getDefaultLibFileName === 'function') {
			return ts.getDefaultLibFileName(compilerOptions);
		}
		return 'lib.d.ts';
	};

	const host = {
		fileExists,
		readFile: readVirtualOrDisk,
		directoryExists: (dir: string): boolean => {
			const d = dir.replace(/\\/g, '/').replace(/\/$/, '') || FEED_VIRTUAL_ROOT;
			if (d === FEED_VIRTUAL_ROOT || d === '') return true;
			const prefix = d.endsWith('/') ? d : `${d}/`;
			for (const k of virtualFiles.keys()) {
				if (k.startsWith(prefix) || k === d) return true;
			}
			if (!opts.skipDefaultLib && ts.sys?.directoryExists?.(dir)) return true;
			return false;
		},
		getSourceFile: (
			fileName: string,
			languageVersion: number,
			onError?: (msg: string) => void,
		) => {
			const text = readVirtualOrDisk(fileName);
			if (text === undefined) {
				// Track missing default lib probes
				if (/lib\.[^/]+\.d\.ts$/i.test(fileName) || fileName.endsWith('lib.d.ts')) {
					if (!missingLibs.includes(fileName)) missingLibs.push(fileName);
				}
				onError?.(`File not found: ${fileName}`);
				return undefined;
			}
			try {
				return ts.createSourceFile(fileName, text, languageVersion, true);
			} catch (e) {
				onError?.(e instanceof Error ? e.message : String(e));
				return undefined;
			}
		},
		getDefaultLibFileName,
		writeFile: () => {
			/* noEmit */
		},
		getCurrentDirectory: () => FEED_VIRTUAL_ROOT,
		getCanonicalFileName: (f: string) => f.replace(/\\/g, '/'),
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => '\n',
		getDirectories: (path: string): string[] => {
			if (ts.sys?.getDirectories) {
				try {
					return ts.sys.getDirectories(path);
				} catch {
					/* ignore */
				}
			}
			return [];
		},
		realpath: (p: string) => ts.sys?.realpath?.(p) ?? p,
	};

	const rootFiles = [...feedFiles.keys()]
		.filter(isJsTsRoot)
		.map(toVirtualPath)
		.sort((a, b) => a.localeCompare(b));

	// Ensure baseUrl for path mapping when tsconfig used relative "."
	if (!options.baseUrl) {
		options.baseUrl = FEED_VIRTUAL_ROOT;
	}

	const program = ts.createProgram(rootFiles, options, host);

	let diagnostics: readonly unknown[] = parseErrors;
	try {
		if (typeof ts.getPreEmitDiagnostics === 'function') {
			diagnostics = [...parseErrors, ...ts.getPreEmitDiagnostics(program)];
		}
	} catch {
		/* soft */
	}

	// Probe default lib once for completeness stamp
	if (!opts.skipDefaultLib) {
		const libName = getDefaultLibFileName(options);
		if (!readVirtualOrDisk(libName) && !fileExists(libName)) {
			if (!missingLibs.includes(libName)) missingLibs.push(libName);
		}
	}

	return {
		program,
		host,
		rootFiles,
		compilerOptions: options,
		toVirtual: toVirtualPath,
		fromVirtual: fromVirtualPath,
		feedFiles,
		virtualFiles,
		completeness: {
			tsconfig,
			missingLibs,
			rootFileCount: rootFiles.length,
		},
		diagnostics,
	};
}

/**
 * Resolve a module specifier via Program host (ts.resolveModuleName).
 * Returns feed-relative path when the hit is inside the feed; else null.
 */
export function resolveSpecifierWithProgram(
	ts: ProgramTypescriptModule,
	feed: CreateFeedProgramResult,
	containingFeedPath: string,
	specifier: string,
): string | null {
	const containing = feed.toVirtual(containingFeedPath);
	try {
		const result = ts.resolveModuleName(
			specifier,
			containing,
			feed.compilerOptions,
			feed.host,
		);
		const resolved = result.resolvedModule?.resolvedFileName;
		if (!resolved) return null;
		const feedPath = feed.fromVirtual(resolved);
		if (feed.feedFiles.has(feedPath)) return feedPath;
		// Also try normalized virtual key
		const norm = resolved.replace(/\\/g, '/');
		if (feed.virtualFiles.has(norm)) return feed.fromVirtual(norm);
		return null;
	} catch {
		return null;
	}
}
