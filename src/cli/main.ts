/**
 * Arch Atlas agent CLI — third host over pure core (dir|zip → JSON lens).
 *
 * Commands:
 *   digest <path>  — catalog rankings + structural graph projection
 *   tree <path>    — hierarchical file tree with parse flags
 *   file <path> --file <rel> — compact per-file report (no source dump)
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	buildAgentDigest,
	buildAgentFileReport,
	buildAgentTree,
	indexHostFeed,
} from '@core/index.ts';
import { DEFAULT_MAX_DEPTH, loadFeed } from './loadFeed.ts';

const CLI_LIMIT_DEFAULT = 40;

type GlobalOpts = {
	out?: string;
	limit: number;
	maxDepth: number;
	file?: string;
	help: boolean;
};

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
	stream.write(`arch-atlas — local-first architecture lens for agents

Usage:
  arch-atlas digest <path> [--limit N] [--max-depth N] [--out file.json]
  arch-atlas tree   <path> [--max-depth N] [--out file.json]
  arch-atlas file   <path> --file <relative/path> [--limit N] [--max-depth N] [--out file.json]

<path> is a directory or .zip file. Analysis is Level-1 Estimate only
(static JS/TS import graph; not LSP / not tree-shake). No raw source in output.

Options:
  --limit N       Top-N for ranking bins (digest/file catalog). Default ${CLI_LIMIT_DEFAULT}.
  --max-depth N   Max path segments from walk root for directory feeds.
                  Default ${DEFAULT_MAX_DEPTH}. 0 or negative = unlimited.
  --file <rel>    Relative path inside the project (required for file command).
  --out <path>    Write JSON to file instead of stdout.
  -h, --help      Show this help.

Exit codes: 0 success (including empty graph with warnings); 1 usage/IO/index failure.
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
		help: false,
	};
	const positional: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === '-h' || a === '--help') {
			opts.help = true;
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
		if (a.startsWith('-')) {
			return { command: '', opts, error: `Unknown option: ${a}` };
		}
		positional.push(a);
	}

	// Allow `arch-atlas <path>` as digest shorthand
	let command = positional[0] ?? '';
	let target = positional[1];
	if (command && command !== 'digest' && command !== 'tree' && command !== 'file') {
		// First arg is path → default digest
		target = command;
		command = 'digest';
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

	if (command !== 'digest' && command !== 'tree' && command !== 'file') {
		process.stderr.write(`error: unknown command: ${command}\n\n`);
		printUsage();
		return 1;
	}

	let feed;
	try {
		feed = loadFeed(target, { maxDepth: opts.maxDepth });
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
			{ catalog: { limit: opts.limit } },
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
	const warnings = feed.warnings;

	try {
		if (command === 'digest') {
			const digest = buildAgentDigest({
				graph,
				catalog,
				source,
				warnings,
			});
			emitJson(digest, opts.out);
			return 0;
		}

		if (command === 'tree') {
			const tree = buildAgentTree({ graph, source, warnings });
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
