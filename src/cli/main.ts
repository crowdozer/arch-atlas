/**
 * Arch Atlas agent CLI — third host over pure core (dir|zip → JSON lens).
 *
 * Commands:
 *   digest <path>  — catalog rankings + structural graph projection
 *   tree <path>    — hierarchical file tree with parse flags
 *   file <path> --file <rel> — compact per-file report (no source dump)
 *   impact <path> --base <ref> --head <ref> — import-topology delta between refs
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	buildAgentDigest,
	buildAgentFileReport,
	buildAgentImpact,
	buildAgentTree,
	indexHostFeed,
} from '@core/index.ts';
import { loadExactExportSurface } from './exactSurface.ts';
import { DEFAULT_MAX_DEPTH, loadFeed } from './loadFeed.ts';
import { loadGitRef } from './loadGitRef.ts';
import { compileOmitMatcher, parseOmitFlagValues } from './omitGlobs.ts';

const CLI_LIMIT_DEFAULT = 40;

const KNOWN_COMMANDS = new Set(['digest', 'tree', 'file', 'impact']);

type GlobalOpts = {
	out?: string;
	limit: number;
	maxDepth: number;
	/** Raw --omit values (may include comma lists); normalized later. */
	omitRaw: string[];
	/**
	 * Exact export-surface LOC. Default **true for digest** (soft-fallback).
	 * `--estimate` forces off; `--exact` / `--exact-local` force on (fail-closed).
	 */
	exact: boolean;
	/** Explicit --exact / --exact-local (fail-closed on engine error). */
	exactExplicit: boolean;
	/** With exact: skip CDN (local typescript-classic / inject only). */
	exactLocalOnly: boolean;
	/** Force estimate-only (opt out of default Exact on digest). */
	estimate: boolean;
	/** Tree: emit full leaves (`--tree-full`); default summary. */
	treeFull: boolean;
	file?: string;
	/** Git ref for impact --base (required for impact). */
	base?: string;
	/** Git ref for impact --head (required for impact). */
	head?: string;
	help: boolean;
};

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
	stream.write(`arch-atlas — local-first architecture lens for agents

Usage:
  arch-atlas digest <path> [options]
  arch-atlas tree   <path> [options]
  arch-atlas file   <path> --file <relative/path> [options]
  arch-atlas impact <git-repo> --base <ref> --head <ref> [options]

<path> is a directory or .zip file (digest/tree/file). For impact, <git-repo>
is a git work tree root; trees are materialized via git archive (no dirty tree).
Default digest analysis is Exact export-surface mass when the engine loads
(Estimate topology always). Not LSP / not tree-shake. No raw source in output.

Impact usage cheatsheet (read order for large JSON):
  .grok/reference/impact-cheatsheet.md

Options:
  --limit N       Top-N for ranking bins (digest/file catalog; impact movers /
                  edge samples). Default ${CLI_LIMIT_DEFAULT}.
  --max-depth N   Max path segments from walk root for directory feeds.
                  Default ${DEFAULT_MAX_DEPTH}. 0 or negative = unlimited.
  --omit GLOB     Drop relative paths matching a picomatch glob (repeatable).
                  Bare names match that segment anywhere (fixtures → fixtures/**).
                  Also: --omit=**/fixtures/** or --omit=fixtures,dist
  --base <ref>    Impact: base git ref (required). Example: main, HEAD^, abc123
  --head <ref>    Impact: head git ref (required). Example: HEAD, feature-branch
  --estimate      Digest: skip Exact mass (estimate-only fileLoc / empty mass bins).
  --exact         Digest: require Exact export-surface (fail-closed on engine error).
                  Loads classic TypeScript: local → jsDelivr → unpkg.
                  Graph topology bins unchanged; fileLoc uses export-surface LOC.
                  Not a language server / not bundler tree-shake.
                  Ignored for impact (topology-only experiment).
  --exact-local   Like --exact but never hits CDN (local/inject only).
  --tree-full     Tree: full verbose leaves (default is summary directory rolls).
  --file <rel>    Relative path inside the project (required for file command).
  --out <path>    Write JSON to file instead of stdout.
  -h, --help      Show this help.

Examples:
  arch-atlas digest . --omit fixtures
  arch-atlas digest . --omit fixtures --estimate --out runtime.json
  arch-atlas digest . --exact-local --out exact.json
  npm run atlas -- digest . --omit fixtures
  npm run atlas -- tree . --tree-full
  npm run atlas -- impact . --base HEAD^ --head HEAD --omit fixtures --out /tmp/impact.json

Exit codes: 0 success (including empty graph / empty delta with warnings);
1 usage/IO/git/index failure. Explicit --exact engine failure exits 1.
Default Exact soft-falls back to estimate (exit 0) with a warning.
`);
}

function parseArgs(argv: string[]): {
	command: string;
	target?: string;
	opts: GlobalOpts;
	error?: string;
} {
	const opts: GlobalOpts = {
		limit: CLI_LIMIT_DEFAULT,
		maxDepth: DEFAULT_MAX_DEPTH,
		omitRaw: [],
		// Digest defaults Exact-on; resolved after command known
		exact: true,
		exactExplicit: false,
		exactLocalOnly: false,
		estimate: false,
		treeFull: false,
		help: false,
	};
	const positional: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === '-h' || a === '--help') {
			opts.help = true;
			continue;
		}
		if (a === '--estimate') {
			opts.estimate = true;
			opts.exact = false;
			opts.exactExplicit = false;
			continue;
		}
		if (a === '--exact') {
			opts.exact = true;
			opts.exactExplicit = true;
			opts.estimate = false;
			continue;
		}
		if (a === '--exact-local') {
			opts.exact = true;
			opts.exactExplicit = true;
			opts.exactLocalOnly = true;
			opts.estimate = false;
			continue;
		}
		if (a === '--tree-full') {
			opts.treeFull = true;
			continue;
		}
		if (a === '--out') {
			const v = argv[++i];
			if (!v) return { command: '', opts, error: '--out requires a path' };
			opts.out = v;
			continue;
		}
		if (a.startsWith('--out=')) {
			opts.out = a.slice('--out='.length);
			continue;
		}
		if (a === '--limit') {
			const v = argv[++i];
			if (!v || Number.isNaN(Number(v))) {
				return { command: '', opts, error: '--limit requires a number' };
			}
			opts.limit = Math.max(0, Math.floor(Number(v)));
			continue;
		}
		if (a.startsWith('--limit=')) {
			const n = Number(a.slice('--limit='.length));
			if (Number.isNaN(n)) {
				return { command: '', opts, error: '--limit requires a number' };
			}
			opts.limit = Math.max(0, Math.floor(n));
			continue;
		}
		if (a === '--max-depth') {
			const v = argv[++i];
			if (v === undefined || Number.isNaN(Number(v))) {
				return { command: '', opts, error: '--max-depth requires a number' };
			}
			opts.maxDepth = Math.floor(Number(v));
			continue;
		}
		if (a.startsWith('--max-depth=')) {
			const n = Number(a.slice('--max-depth='.length));
			if (Number.isNaN(n)) {
				return { command: '', opts, error: '--max-depth requires a number' };
			}
			opts.maxDepth = Math.floor(n);
			continue;
		}
		if (a === '--omit') {
			const v = argv[++i];
			if (!v) return { command: '', opts, error: '--omit requires a glob pattern' };
			opts.omitRaw.push(v);
			continue;
		}
		if (a.startsWith('--omit=')) {
			const v = a.slice('--omit='.length);
			if (!v) return { command: '', opts, error: '--omit requires a glob pattern' };
			opts.omitRaw.push(v);
			continue;
		}
		if (a === '--file') {
			const v = argv[++i];
			if (!v) return { command: '', opts, error: '--file requires a relative path' };
			opts.file = v;
			continue;
		}
		if (a.startsWith('--file=')) {
			opts.file = a.slice('--file='.length);
			continue;
		}
		if (a === '--base') {
			const v = argv[++i];
			if (!v) return { command: '', opts, error: '--base requires a git ref' };
			opts.base = v;
			continue;
		}
		if (a.startsWith('--base=')) {
			const v = a.slice('--base='.length);
			if (!v) return { command: '', opts, error: '--base requires a git ref' };
			opts.base = v;
			continue;
		}
		if (a === '--head') {
			const v = argv[++i];
			if (!v) return { command: '', opts, error: '--head requires a git ref' };
			opts.head = v;
			continue;
		}
		if (a.startsWith('--head=')) {
			const v = a.slice('--head='.length);
			if (!v) return { command: '', opts, error: '--head requires a git ref' };
			opts.head = v;
			continue;
		}
		if (a.startsWith('-')) {
			return { command: '', opts, error: `Unknown option: ${a}` };
		}
		positional.push(a);
	}

	// Allow `arch-atlas <path>` as digest shorthand
	let command = positional[0] ?? '';
	let target = positional[1];
	if (command && !KNOWN_COMMANDS.has(command)) {
		// First arg is path → default digest
		target = command;
		command = 'digest';
	}

	// Exact default applies to **digest only**. Other commands stay estimate
	// unless the user passed --exact / --exact-local (exactExplicit).
	if (command !== 'digest' && !opts.exactExplicit) {
		opts.exact = false;
	}

	return { command, target, opts };
}

function emitJson(value: unknown, outPath?: string): void {
	const text = JSON.stringify(value, null, 2) + '\n';
	if (outPath) {
		writeFileSync(path.resolve(outPath), text, 'utf8');
	} else {
		process.stdout.write(text);
	}
}

export async function runCli(argv: string[]): Promise<number> {
	const { command, target, opts, error } = parseArgs(argv);

	if (error) {
		process.stderr.write(`error: ${error}\n\n`);
		printUsage();
		return 1;
	}

	if (opts.help || !command) {
		printUsage(opts.help ? process.stdout : process.stderr);
		return opts.help ? 0 : 1;
	}

	if (!target) {
		process.stderr.write('error: missing <path> (directory or .zip)\n\n');
		printUsage();
		return 1;
	}

	if (command === 'file' && !opts.file) {
		process.stderr.write('error: file command requires --file <relative/path>\n\n');
		printUsage();
		return 1;
	}

	if (!KNOWN_COMMANDS.has(command)) {
		process.stderr.write(`error: unknown command: ${command}\n\n`);
		printUsage();
		return 1;
	}

	if (command === 'impact') {
		if (!opts.base || !opts.head) {
			process.stderr.write(
				'error: impact requires --base <ref> and --head <ref>\n\n',
			);
			printUsage();
			return 1;
		}
		return runImpact(target, opts);
	}

	const omit = parseOmitFlagValues(opts.omitRaw);
	const shouldOmit = compileOmitMatcher(omit);

	let feed;
	try {
		feed = loadFeed(target, { maxDepth: opts.maxDepth, omit });
	} catch (err) {
		process.stderr.write(
			`error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}

	let graph;
	let catalog;
	try {
		const result = indexHostFeed(
			{ files: feed.files },
			{
				catalog: { limit: opts.limit },
				isOmittedPath: omit.length ? shouldOmit : undefined,
			},
		);
		graph = result.graph;
		catalog = result.catalog;
	} catch (err) {
		process.stderr.write(
			`error: index failed: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}

	const source = feed.source;
	const warnings = [...feed.warnings];

	const scopeBase = {
		omit,
		includeTests: true as const,
		exactRequested: command === 'digest' ? opts.exact : false,
		feedKind: source.kind,
	};

	let exactInput:
		| {
				engineSource: 'inject' | 'local' | 'jsdelivr' | 'unpkg';
				classicAst?: boolean;
				exportSurfaceLoc: ReadonlyMap<string, number>;
		  }
		| undefined;

	const wantExact = command === 'digest' && opts.exact && !opts.estimate;

	if (wantExact) {
		const exact = await loadExactExportSurface(graph, {
			localOnly: opts.exactLocalOnly,
		});
		if (!exact.ok) {
			if (opts.exactExplicit) {
				process.stderr.write(
					`error: --exact failed: ${exact.error}` +
						(exact.tried?.length ? ` (tried: ${exact.tried.join(', ')})` : '') +
						'\n',
				);
				return 1;
			}
			// Soft-fallback: default Exact → estimate
			warnings.push(
				`Exact export-surface unavailable (${exact.error}); falling back to estimate` +
					(exact.tried?.length ? ` (tried: ${exact.tried.join(', ')})` : ''),
			);
		} else {
			exactInput = {
				engineSource: exact.source,
				classicAst: exact.classicAst,
				exportSurfaceLoc: exact.maps.exportSurfaceLoc,
			};
		}
	} else if (opts.exactExplicit && command !== 'digest') {
		// Only warn when user asked for Exact on a non-digest command
		warnings.push(
			'--exact applies to digest mass/fileLoc only; ignored for this command (topology stays Estimate).',
		);
	}

	try {
		if (command === 'digest') {
			const digest = buildAgentDigest({
				graph,
				catalog,
				source,
				warnings,
				exact: exactInput,
				scope: {
					...scopeBase,
					exactRequested: opts.exact && !opts.estimate,
					exactApplied: Boolean(exactInput),
				},
			});
			emitJson(digest, opts.out);
			return 0;
		}

		if (command === 'tree') {
			const tree = buildAgentTree({
				graph,
				source,
				warnings,
				mode: opts.treeFull ? 'full' : 'summary',
			});
			emitJson(tree, opts.out);
			return 0;
		}

		// file
		const report = buildAgentFileReport({
			graph,
			catalog,
			source,
			filePath: opts.file!,
			warnings,
			scope: {
				...scopeBase,
				exactRequested: false,
				exactApplied: false,
			},
		});
		emitJson(report, opts.out);
		// Missing file is still valid JSON; exit 0 (agent can check exists)
		return 0;
	} catch (err) {
		process.stderr.write(
			`error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}
}

/**
 * Dual git-archive index → pure buildAgentImpact.
 * Exported for tests that want to bypass argv (git still required at call site).
 */
export function runImpact(
	repoPath: string,
	opts: GlobalOpts,
): number {
	const omit = parseOmitFlagValues(opts.omitRaw);
	const shouldOmit = compileOmitMatcher(omit);
	const warnings: string[] = [];

	if (opts.exactExplicit) {
		warnings.push(
			'--exact ignored for impact (topology delta only; Exact mass not in this experiment).',
		);
	}

	const feedOpts = { maxDepth: opts.maxDepth, omit };

	let baseFeed;
	let headFeed;
	try {
		baseFeed = loadGitRef(repoPath, { ...feedOpts, ref: opts.base! });
		headFeed = loadGitRef(repoPath, { ...feedOpts, ref: opts.head! });
	} catch (err) {
		process.stderr.write(
			`error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}
	warnings.push(...baseFeed.warnings, ...headFeed.warnings);

	let baseIdx;
	let headIdx;
	try {
		const indexOpts = {
			catalog: { limit: opts.limit },
			isOmittedPath: omit.length ? shouldOmit : undefined,
		};
		baseIdx = indexHostFeed({ files: baseFeed.files }, indexOpts);
		headIdx = indexHostFeed({ files: headFeed.files }, indexOpts);
	} catch (err) {
		process.stderr.write(
			`error: index failed: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}

	try {
		const impact = buildAgentImpact({
			base: baseIdx,
			head: headIdx,
			refs: {
				base: opts.base!,
				head: opts.head!,
				path: path.resolve(repoPath),
			},
			warnings,
			limit: opts.limit,
		});
		emitJson(impact, opts.out);
		return 0;
	} catch (err) {
		process.stderr.write(
			`error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}
}

// Entrypoint when run via tsx / bin (not when imported by tests)
const isDirectRun =
	typeof process.argv[1] === 'string' &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1]!)).href;

if (isDirectRun) {
	void runCli(process.argv.slice(2)).then(
		(code) => {
			process.exit(code);
		},
		(err) => {
			process.stderr.write(
				`error: ${err instanceof Error ? err.message : String(err)}\n`,
			);
			process.exit(1);
		},
	);
}
