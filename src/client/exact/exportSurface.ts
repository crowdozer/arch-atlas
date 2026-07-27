/**
 * Pure export-surface mass analysis for JS/TS (no typescript package).
 *
 * Coarse honesty: match import bindings to export declarations by name and
 * count line spans. Never returns whole-file LOC. Used by the Exact provider
 * whether or not a classic TS Program/API is available (TS 7+ removed the
 * classic createSourceFile surface from the default package export).
 */

import type { ImportBinding } from '@core/graph/types.ts';

export type ExportSpan = {
	name: string;
	kind: 'default' | 'named';
	startLine: number;
	endLine: number;
	text: string;
};

/**
 * Collect export spans from source text (line-oriented, honest + coarse).
 * Handles common forms: export function/class/const/type/interface/enum,
 * export default, export { a, b as c }, export { x } from '…'.
 */
export function collectExportSpansFromText(text: string): ExportSpan[] {
	const lines = text.split(/\n/);
	const out: ExportSpan[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';
		const lineNo = i + 1;

		// export default …
		if (/^\s*export\s+default\b/.test(line)) {
			const end = blockEndLine(lines, i);
			out.push({
				name: 'default',
				kind: 'default',
				startLine: lineNo,
				endLine: end,
				text: sliceLines(lines, i, end),
			});
			i = end;
			continue;
		}

		// export function/class/const/let/var/type/interface/enum name
		const named =
			/^\s*export\s+(?:async\s+)?(?:declare\s+)?(?:function|class|const|let|var|type|interface|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/.exec(
				line,
			);
		if (named?.[1]) {
			const end = blockEndLine(lines, i);
			out.push({
				name: named[1],
				kind: 'named',
				startLine: lineNo,
				endLine: end,
				text: sliceLines(lines, i, end),
			});
			i = end;
			continue;
		}

		// export { a, b as c } / export type { … }
		const brace = /^\s*export\s+(?:type\s+)?\{([^}]*)\}/.exec(line);
		if (brace) {
			const body = brace[1] ?? '';
			// multi-line export { … } — gather until closing brace if needed
			let full = line;
			let end = i;
			if (!line.includes('}')) {
				while (end + 1 < lines.length && !full.includes('}')) {
					end += 1;
					full += '\n' + (lines[end] ?? '');
				}
				const m = /export\s+(?:type\s+)?\{([^}]*)\}/.exec(full);
				if (m?.[1] !== undefined) {
					for (const name of parseExportSpecifiers(m[1])) {
						out.push({
							name,
							kind: 'named',
							startLine: lineNo,
							endLine: end + 1,
							text: sliceLines(lines, i, end + 1),
						});
					}
					i = end + 1;
					continue;
				}
			} else {
				for (const name of parseExportSpecifiers(body)) {
					out.push({
						name,
						kind: 'named',
						startLine: lineNo,
						endLine: lineNo,
						text: line,
					});
				}
				i += 1;
				continue;
			}
		}

		// export * as ns from '…'
		const starAs = /^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\b/.exec(line);
		if (starAs?.[1]) {
			out.push({
				name: starAs[1],
				kind: 'named',
				startLine: lineNo,
				endLine: lineNo,
				text: line,
			});
			i += 1;
			continue;
		}

		i += 1;
	}
	return out;
}

function parseExportSpecifiers(body: string): string[] {
	const names: string[] = [];
	for (const part of body.split(',')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		// type Foo as Bar | Foo as Bar | Foo
		const cleaned = trimmed.replace(/^type\s+/, '');
		const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(cleaned);
		if (asMatch?.[2]) {
			names.push(asMatch[2]);
			continue;
		}
		const id = /^([A-Za-z_$][\w$]*)$/.exec(cleaned);
		if (id?.[1]) names.push(id[1]);
	}
	return names;
}

/** End line (1-based inclusive) of a statement/block starting at startIdx (0-based). */
function blockEndLine(lines: string[], startIdx: number): number {
	const start = lines[startIdx] ?? '';
	// single-line if no brace or braces close on same line
	if (!start.includes('{') || braceBalance(start) === 0) {
		// const x = 1; or function f();
		return startIdx + 1;
	}
	let bal = braceBalance(start);
	let i = startIdx;
	while (bal > 0 && i + 1 < lines.length) {
		i += 1;
		bal += braceBalance(lines[i] ?? '');
	}
	return i + 1;
}

function braceBalance(s: string): number {
	// ignore braces in strings roughly
	let bal = 0;
	let inStr: '"' | "'" | '`' | null = null;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inStr) {
			if (c === '\\') {
				i += 1;
				continue;
			}
			if (c === inStr) inStr = null;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') {
			inStr = c;
			continue;
		}
		if (c === '{') bal += 1;
		else if (c === '}') bal -= 1;
	}
	return bal;
}

function sliceLines(lines: string[], start0: number, end1: number): string {
	return lines.slice(start0, end1).join('\n');
}

/**
 * Mass for import bindings against export spans.
 * - side-effect only → 1
 * - namespace → union of all export span lines (or null if none)
 * - named/default → union of matched spans; any missing name → null
 */
export function massForBindings(
	bindings: ImportBinding[],
	spans: ExportSpan[],
): number | null {
	if (!bindings.length) return null;

	const onlySideEffect = bindings.every((b) => b.kind === 'side-effect');
	if (onlySideEffect) return 1;

	const wanted = new Set<string>();
	let wantsDefault = false;
	let wantsNamespace = false;

	for (const b of bindings) {
		if (b.kind === 'side-effect') continue;
		if (b.kind === 'default') wantsDefault = true;
		else if (b.kind === 'namespace') wantsNamespace = true;
		else if (b.kind === 'named') wanted.add(b.imported);
	}

	if (wantsNamespace) {
		if (!spans.length) return null;
		return lineUnionSize(spans);
	}

	const matched: ExportSpan[] = [];
	if (wantsDefault) {
		const d = spans.find((s) => s.kind === 'default' || s.name === 'default');
		if (d) matched.push(d);
	}
	for (const name of wanted) {
		const hit = spans.find((s) => s.name === name);
		if (hit) matched.push(hit);
	}

	const need = (wantsDefault ? 1 : 0) + wanted.size;
	if (need === 0) return 1;
	if (matched.length < need) return null;
	return lineUnionSize(matched);
}

function lineUnionSize(spans: ExportSpan[]): number {
	const lines = new Set<number>();
	for (const s of spans) {
		for (let L = s.startLine; L <= s.endLine; L++) lines.add(L);
	}
	return lines.size > 0 ? lines.size : 0;
}

/** Pick spans matching bindings for inspect snippets. */
export function pickSpansForBindings(
	bindings: ImportBinding[],
	spans: ExportSpan[],
): ExportSpan[] {
	if (!bindings.length) return [];
	const onlySide = bindings.every((b) => b.kind === 'side-effect');
	// Side-effect import has no named surface — do not dump the whole export list
	if (onlySide) return [];
	// namespace import: show export surface (capped)
	if (bindings.some((b) => b.kind === 'namespace')) {
		return spans.slice(0, 12);
	}
	const wanted = new Set<string>();
	let wantsDefault = false;
	for (const b of bindings) {
		if (b.kind === 'default') wantsDefault = true;
		else if (b.kind === 'named') wanted.add(b.imported);
	}
	const picked: ExportSpan[] = [];
	if (wantsDefault) {
		const d = spans.find((s) => s.kind === 'default' || s.name === 'default');
		if (d) picked.push(d);
	}
	for (const name of wanted) {
		const hit = spans.find((s) => s.name === name);
		if (hit) picked.push(hit);
	}
	return picked;
}
