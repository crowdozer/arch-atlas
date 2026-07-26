/**
 * Level-1 static import extraction from JS/TS source text.
 * Observed only — no type resolution. Not a language server.
 */

import type { ExtractedImport } from '@core/graph/types.ts';

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

/**
 * Extract import/export/require/dynamic-import string specifiers.
 */
export function extractImports(source: string): ExtractedImport[] {
	const cleaned = stripComments(source);
	const found: ExtractedImport[] = [];
	const seen = new Set<string>();

	const push = (specifier: string, form: ExtractedImport['form'], index: number) => {
		const spec = specifier.trim();
		if (!spec) return;
		const key = `${form}\0${spec}`;
		if (seen.has(key)) return;
		seen.add(key);
		found.push({ specifier: spec, form, line: lineOf(cleaned, index) });
	};

	// import ... from 'x'  |  import 'x'
	const importFrom =
		/\bimport\s+(?:type\s+)?(?:[^'";\n]+?\s+from\s+)?['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = importFrom.exec(cleaned)) !== null) {
		push(m[1]!, 'import', m.index);
	}

	// export ... from 'x'  |  export * from 'x'
	const exportFrom =
		/\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
	while ((m = exportFrom.exec(cleaned)) !== null) {
		push(m[1]!, 'export', m.index);
	}

	// require('x')
	const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((m = requireRe.exec(cleaned)) !== null) {
		push(m[1]!, 'require', m.index);
	}

	// import('x') dynamic — string literal only
	const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((m = dynRe.exec(cleaned)) !== null) {
		push(m[1]!, 'dynamic', m.index);
	}

	return found;
}
