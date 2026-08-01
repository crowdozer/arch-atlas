/**
 * Level-1 import extraction for Astro SFCs.
 * Observed only - frontmatter + <script> islands, not a language server.
 * Template HTML / component tags are not a separate graph this ship.
 */

import type { ExtractedImport } from '@core/graph/types.ts';
import { extractImports } from '@core/parse/imports.ts';

export type AstroScriptIsland = {
	/** Island source (without fences / tags). */
	text: string;
	/** 0-based line index of the first island line in the full file. */
	lineOffset: number;
};

/**
 * Collect Astro frontmatter (`---` … `---`) and `<script>` body islands.
 * Skips `src=` external scripts (no inline body).
 */
export function extractAstroScriptIslands(source: string): AstroScriptIsland[] {
	const islands: AstroScriptIsland[] = [];
	const lines = source.split(/\r?\n/);

	// Frontmatter: opening --- on first non-empty line (Astro convention)
	let i = 0;
	while (i < lines.length && lines[i]!.trim() === '') i++;
	if (i < lines.length && lines[i]!.trim() === '---') {
		const openIdx = i;
		i++;
		const body: string[] = [];
		while (i < lines.length && lines[i]!.trim() !== '---') {
			body.push(lines[i]!);
			i++;
		}
		if (i < lines.length && lines[i]!.trim() === '---') {
			// lineOffset = first body line (openIdx + 1)
			islands.push({
				text: body.join('\n'),
				lineOffset: openIdx + 1,
			});
			i++; // past closing ---
		}
	}

	// Inline <script>…</script> (incl. lang="ts", is:inline, etc.)
	// Multi-line open tag supported; skip tags with src= (external).
	const scriptOpen =
		/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	let m: RegExpExecArray | null;
	while ((m = scriptOpen.exec(source)) !== null) {
		const attrs = m[1] ?? '';
		if (/\bsrc\s*=/i.test(attrs)) continue;
		const body = m[2] ?? '';
		// Character offset → line offset of body start (after '>')
		const openEnd = m.index + m[0].indexOf('>') + 1;
		const prefix = source.slice(0, openEnd);
		const lineOffset = prefix.split(/\r?\n/).length - 1;
		islands.push({ text: body, lineOffset });
	}

	return islands;
}

/** Concatenate islands for tests / debugging (line numbers not preserved). */
export function extractAstroScriptText(source: string): string {
	return extractAstroScriptIslands(source)
		.map((isl) => isl.text)
		.join('\n');
}

/**
 * Level-1 static imports from Astro script islands.
 * Line numbers are adjusted to the full `.astro` file.
 */
export function extractAstroImports(source: string): ExtractedImport[] {
	const out: ExtractedImport[] = [];
	const seen = new Set<string>();
	for (const island of extractAstroScriptIslands(source)) {
		const imps = extractImports(island.text);
		for (const imp of imps) {
			// extractImports lines are 1-based within the island
			const line = imp.line + island.lineOffset;
			const key = `${imp.specifier}\0${imp.form}\0${line}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ ...imp, line });
		}
	}
	return out;
}
