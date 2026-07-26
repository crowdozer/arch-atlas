/**
 * Level-1 parse capability classification.
 * Single map of what the import extractor can handle vs display-only / config.
 * Not a language server — extension- and role-based only.
 */

import type { FileParseKind } from '@core/graph/types.ts';
import { isConfigFile, isSourceFile } from '@core/ignore.ts';

export type { FileParseKind };

export type FileParseInfo = {
	/** True when Level-1 `extractImports` runs on this file. */
	importParseable: boolean;
	kind: FileParseKind;
	/** Short human reason (tree title / status). */
	note: string;
};

/** Common source languages without a Level-1 import extractor yet. */
const UNSUPPORTED_SOURCE_EXT =
	/\.(py|rb|go|rs|java|kt|kts|php|cs|swift|scala|clj|ex|exs|erl|hs|lua|r|jl|vue|svelte|astro)$/i;

/** Non-code text kept in the graph for tree / size context only. */
const DISPLAY_TEXT_EXT = /\.(json|md|mdx|css|scss|less|html|htm|svg|yml|yaml|toml|txt|xml)$/i;

/**
 * Classify a path for import parsing (does not decide ignore / keep).
 */
export function classifyFileParse(path: string): FileParseInfo {
	if (isSourceFile(path)) {
		return {
			importParseable: true,
			kind: 'js-ts-import',
			note: 'Import-parsed (JS/TS Level-1)',
		};
	}
	if (isConfigFile(path) || /(^|\/)package\.json$/i.test(path)) {
		return {
			importParseable: false,
			kind: 'config',
			note: 'Config/manifest — not import-parsed',
		};
	}
	if (UNSUPPORTED_SOURCE_EXT.test(path)) {
		return {
			importParseable: false,
			kind: 'unsupported-language',
			note: 'Language not supported at Level-1 (shown, not parsed)',
		};
	}
	if (DISPLAY_TEXT_EXT.test(path)) {
		return {
			importParseable: false,
			kind: 'text',
			note: 'Text asset — no import parser',
		};
	}
	return {
		importParseable: false,
		kind: 'unsupported-language',
		note: 'Not import-parseable at Level-1',
	};
}

/**
 * Whether a path should be kept in the graph/tree after ignore filters.
 * Import-parseable sources, config, display text, and known unsupported sources.
 */
export function shouldKeepInGraph(path: string): boolean {
	if (isSourceFile(path) || isConfigFile(path)) return true;
	if (/(^|\/)package\.json$/i.test(path)) return true;
	if (UNSUPPORTED_SOURCE_EXT.test(path)) return true;
	if (DISPLAY_TEXT_EXT.test(path)) return true;
	return false;
}

/** Build path → parse info for all files in a path list (graph keys). */
export function buildParseMap(
	paths: Iterable<string>,
): Map<string, FileParseInfo> {
	const map = new Map<string, FileParseInfo>();
	for (const path of paths) {
		map.set(path, classifyFileParse(path));
	}
	return map;
}

/** Set of paths that are import-parseable. */
export function importParseablePaths(
	parseMap: ReadonlyMap<string, FileParseInfo>,
): Set<string> {
	const out = new Set<string>();
	for (const [path, info] of parseMap) {
		if (info.importParseable) out.add(path);
	}
	return out;
}
