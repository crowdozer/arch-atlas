/**
 * Level-1 static import extraction from JS/TS source text.
 * Observed only - no type resolution. Not a language server.
 */

import type { ExtractedImport, ImportBinding } from '@core/graph/types.ts';

/** Strip // line comments and /* block comments without breaking strings (best-effort). */
export function stripComments(source: string): string {
	let out = '';
	let i = 0;
	const n = source.length;
	let state: 'code' | 'squote' | 'dquote' | 'template' | 'line' | 'block' = 'code';

	while (i < n) {
		const c = source[i]!;
		const next = source[i + 1];

		if (state === 'code') {
			if (c === '/' && next === '/') {
				state = 'line';
				i += 2;
				continue;
			}
			if (c === '/' && next === '*') {
				state = 'block';
				i += 2;
				continue;
			}
			if (c === "'") {
				state = 'squote';
				out += c;
				i++;
				continue;
			}
			if (c === '"') {
				state = 'dquote';
				out += c;
				i++;
				continue;
			}
			if (c === '`') {
				state = 'template';
				out += c;
				i++;
				continue;
			}
			out += c;
			i++;
			continue;
		}

		if (state === 'line') {
			if (c === '\n') {
				state = 'code';
				out += c;
			}
			i++;
			continue;
		}

		if (state === 'block') {
			if (c === '*' && next === '/') {
				state = 'code';
				i += 2;
				continue;
			}
			if (c === '\n') out += c;
			i++;
			continue;
		}

		// string-like: copy through, handle escapes
		out += c;
		if (c === '\\' && i + 1 < n) {
			out += source[i + 1];
			i += 2;
			continue;
		}
		if (state === 'squote' && c === "'") state = 'code';
		else if (state === 'dquote' && c === '"') state = 'code';
		else if (state === 'template' && c === '`') state = 'code';
		i++;
	}
	return out;
}

function lineOf(source: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < source.length; i++) {
		if (source[i] === '\n') line++;
	}
	return line;
}

/** Parse named members inside `{ a, b as c, type D }`. */
function parseNamedMembers(body: string): ImportBinding[] {
	const out: ImportBinding[] = [];
	for (const raw of body.split(',')) {
		let part = raw.trim();
		if (!part) continue;
		part = part.replace(/^type\s+/, '').trim();
		if (!part) continue;
		const asM = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
		if (asM) {
			out.push({ kind: 'named', imported: asM[1]!, local: asM[2]! });
			continue;
		}
		const id = part.match(/^([A-Za-z_$][\w$]*)$/);
		if (id) {
			out.push({ kind: 'named', imported: id[1]!, local: id[1]! });
		}
	}
	return out;
}

/**
 * Best-effort import/export-from clause → bindings.
 * Not type-aware; multi-line / exotic syntax may yield side-effect or empty.
 */
export function parseImportClause(clause: string | undefined | null): ImportBinding[] {
	if (clause == null) return [{ kind: 'side-effect' }];
	const c = clause.trim();
	if (!c) return [{ kind: 'side-effect' }];

	// * as ns
	const ns = c.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
	if (ns) return [{ kind: 'namespace', local: ns[1]! }];

	// export * from - no local bindings in the exporting file for callsite scan
	if (c === '*' || c.startsWith('*')) return [{ kind: 'side-effect' }];

	const bindings: ImportBinding[] = [];
	const brace = c.match(/\{([^}]*)\}/);
	if (brace) {
		bindings.push(...parseNamedMembers(brace[1]!));
	}

	// default: identifier before comma / brace (not `type` alone)
	const withoutNamed = c
		.replace(/\{[^}]*\}/g, '')
		.replace(/,/g, ' ')
		.trim();
	if (withoutNamed && !withoutNamed.startsWith('*')) {
		const cleaned = withoutNamed.replace(/^type\s+/, '').trim();
		const def = cleaned.match(/^([A-Za-z_$][\w$]*)/);
		if (def) bindings.unshift({ kind: 'default', local: def[1]! });
	}

	return bindings.length ? bindings : [{ kind: 'side-effect' }];
}

/** Local names useful for estimate callsite scan. */
export function localNamesFromBindings(bindings: ImportBinding[]): string[] {
	const names: string[] = [];
	for (const b of bindings) {
		if (b.kind === 'side-effect') continue;
		names.push(b.local);
	}
	return names;
}

/** Soft cap so pathological text cannot hang the brace-aware static import scan. */
const STATIC_IMPORT_SCAN_CAP = 4000;

function isIdentChar(c: string | undefined): boolean {
	return c != null && /[A-Za-z0-9_$]/.test(c);
}

function skipWs(s: string, i: number): number {
	while (i < s.length && /\s/.test(s[i]!)) i++;
	return i;
}

/** Index of closing quote for a string starting at `open` (the quote char), or -1. */
function findStringEnd(s: string, open: number, quote: "'" | '"'): number {
	let i = open + 1;
	while (i < s.length) {
		const c = s[i]!;
		if (c === '\\') {
			i += 2;
			continue;
		}
		if (c === quote) return i;
		if (c === '\n') return -1; // unclosed single-line string
		i++;
	}
	return -1;
}

/**
 * Index of closing backtick for a template starting at `open` (the `` ` ``), or -1.
 * Escape-aware; same best-effort as stripComments (no nested-`${}` rewrite).
 */
function findTemplateEnd(s: string, open: number): number {
	let i = open + 1;
	while (i < s.length) {
		const c = s[i]!;
		if (c === '\\') {
			i += 2;
			continue;
		}
		if (c === '`') return i;
		i++;
	}
	return -1;
}

/**
 * True when `index` sits in code (not inside a '…' / "…" / `…` span).
 * Used to gate regex-based require / export-from / dynamic-import passes so
 * lookalikes inside string/template literals are not harvested (same class as
 * nextImportKeywordOutsideStrings for static import).
 */
function isCodeIndexOutsideStrings(s: string, index: number): boolean {
	if (index < 0 || index >= s.length) return false;
	let i = 0;
	while (i < index) {
		const c = s[i]!;
		if (c === "'" || c === '"') {
			const end = findStringEnd(s, i, c);
			if (end === -1) return false;
			if (index <= end) return false;
			i = end + 1;
			continue;
		}
		if (c === '`') {
			const end = findTemplateEnd(s, i);
			if (end === -1) return false;
			if (index <= end) return false;
			i = end + 1;
			continue;
		}
		i++;
	}
	return true;
}

/**
 * Next `\bimport\b` keyword outside string/template literals, starting at `from`.
 * Prevents false side-effect specs from e.g. `form: 'import' | 'export' | …`.
 */
function nextImportKeywordOutsideStrings(s: string, from: number): number {
	const n = s.length;
	let i = from;
	while (i < n) {
		const c = s[i]!;
		if (c === "'" || c === '"') {
			const end = findStringEnd(s, i, c);
			if (end === -1) return -1;
			i = end + 1;
			continue;
		}
		if (c === '`') {
			const end = findTemplateEnd(s, i);
			if (end === -1) return -1;
			i = end + 1;
			continue;
		}
		if (
			c === 'i' &&
			s.startsWith('import', i) &&
			!isIdentChar(s[i - 1]) &&
			!isIdentChar(s[i + 6])
		) {
			return i;
		}
		i++;
	}
	return -1;
}

/**
 * Brace-aware static `import` / `import type` extraction.
 * Handles multi-line `import { … }\nfrom '…'` without latching on `from` inside braces.
 * Dynamic `import(` is left to the dynRe pass.
 * Keyword search is string-aware - does not latch `import` inside quotes/templates.
 */
function scanStaticImports(
	cleaned: string,
	push: (
		specifier: string,
		form: ExtractedImport['form'],
		index: number,
		bindings: ImportBinding[],
		typeOnly?: boolean,
	) => void,
): void {
	const n = cleaned.length;
	let i = 0;
	while (i < n) {
		const idx = nextImportKeywordOutsideStrings(cleaned, i);
		if (idx === -1) break;

		const afterImport = idx + 6;
		let j = skipWs(cleaned, afterImport);

		// Dynamic import( - leave to dynRe
		if (j < n && cleaned[j] === '(') {
			i = afterImport;
			continue;
		}

		// Optional `type` (import type { … } / import type Foo); not `typeof`
		let typeOnly = false;
		if (cleaned.startsWith('type', j) && !isIdentChar(cleaned[j + 4])) {
			typeOnly = true;
			j = skipWs(cleaned, j + 4);
		}

		// Side-effect: import 'x' | import "x"
		if (j < n && (cleaned[j] === "'" || cleaned[j] === '"')) {
			const quote = cleaned[j] as "'" | '"';
			const end = findStringEnd(cleaned, j, quote);
			if (end !== -1) {
				// Side-effect imports are never type-only
				push(cleaned.slice(j + 1, end), 'import', idx, [{ kind: 'side-effect' }], false);
				i = end + 1;
				continue;
			}
			i = afterImport;
			continue;
		}

		// Scan for `from '…'` / `from "…"` at brace depth 0
		const scanEnd = Math.min(n, j + STATIC_IMPORT_SCAN_CAP);
		let depth = 0;
		let k = j;
		let inStr: "'" | '"' | '`' | null = null;
		let found = false;
		let clauseEnd = -1;
		let specOpen = -1;
		let specClose = -1;

		while (k < scanEnd) {
			const c = cleaned[k]!;

			if (inStr) {
				if (c === '\\') {
					k += 2;
					continue;
				}
				if (c === inStr) inStr = null;
				k++;
				continue;
			}

			if (c === "'" || c === '"' || c === '`') {
				inStr = c as "'" | '"' | '`';
				k++;
				continue;
			}

			if (c === '{') {
				depth++;
				k++;
				continue;
			}
			if (c === '}') {
				if (depth > 0) depth--;
				k++;
				continue;
			}

			// Statement end without from → not a static import-from
			if (depth === 0 && c === ';') break;

			// At depth 0: \bfrom\b + string specifier
			if (
				depth === 0 &&
				c === 'f' &&
				cleaned.startsWith('from', k) &&
				!isIdentChar(cleaned[k - 1]) &&
				!isIdentChar(cleaned[k + 4])
			) {
				const afterFrom = skipWs(cleaned, k + 4);
				if (afterFrom < n && (cleaned[afterFrom] === "'" || cleaned[afterFrom] === '"')) {
					const quote = cleaned[afterFrom] as "'" | '"';
					const end = findStringEnd(cleaned, afterFrom, quote);
					if (end !== -1) {
						clauseEnd = k;
						specOpen = afterFrom + 1;
						specClose = end;
						found = true;
						break;
					}
				}
			}

			k++;
		}

		if (found && clauseEnd >= j && specOpen >= 0 && specClose > specOpen) {
			const clause = cleaned.slice(j, clauseEnd).trim();
			const specifier = cleaned.slice(specOpen, specClose);
			push(specifier, 'import', idx, parseImportClause(clause || undefined), typeOnly);
			i = specClose + 1;
			continue;
		}

		i = afterImport;
	}
}

/**
 * Extract import/export/require/dynamic-import string specifiers + clause bindings.
 */
export function extractImports(source: string): ExtractedImport[] {
	const cleaned = stripComments(source);
	const found: ExtractedImport[] = [];
	/** form\0spec → index in found (runtime wins over type-only on collide). */
	const seen = new Map<string, number>();

	const push = (
		specifier: string,
		form: ExtractedImport['form'],
		index: number,
		bindings: ImportBinding[],
		typeOnly?: boolean,
	) => {
		const spec = specifier.trim();
		if (!spec) return;
		const key = `${form}\0${spec}`;
		const existingIdx = seen.get(key);
		if (existingIdx !== undefined) {
			const prev = found[existingIdx]!;
			// Prefer runtime (non-typeOnly) when both forms exist
			if (prev.typeOnly && !typeOnly) {
				found[existingIdx] = {
					specifier: spec,
					form,
					line: lineOf(cleaned, index),
					bindings,
					typeOnly: false,
				};
			}
			return;
		}
		seen.set(key, found.length);
		found.push({
			specifier: spec,
			form,
			line: lineOf(cleaned, index),
			bindings,
			...(typeOnly ? { typeOnly: true } : {}),
		});
	};

	// Static import [clause] from 'x' | import 'x' (brace-aware, multi-line OK)
	scanStaticImports(cleaned, push);

	// export ... from 'x'  |  export type … from 'x'  |  export * from 'x'
	const exportFrom =
		/\bexport\s+(type\s+)?(\*|\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = exportFrom.exec(cleaned)) !== null) {
		if (!isCodeIndexOutsideStrings(cleaned, m.index)) continue;
		const typeOnly = Boolean(m[1]);
		const clause = m[2]!;
		const bindings =
			clause === '*'
				? ([{ kind: 'side-effect' }] as ImportBinding[])
				: parseImportClause(clause);
		push(m[3]!, 'export', m.index, bindings, typeOnly);
	}

	// require('x') - binding lives on the left-hand side; not extracted here
	const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((m = requireRe.exec(cleaned)) !== null) {
		if (!isCodeIndexOutsideStrings(cleaned, m.index)) continue;
		push(m[1]!, 'require', m.index, [{ kind: 'side-effect' }]);
	}

	// import('x') dynamic - string literal only
	const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((m = dynRe.exec(cleaned)) !== null) {
		if (!isCodeIndexOutsideStrings(cleaned, m.index)) continue;
		push(m[1]!, 'dynamic', m.index, [{ kind: 'side-effect' }]);
	}

	return found;
}
