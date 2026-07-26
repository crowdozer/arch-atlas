/**
 * Level-1 static import extraction from JS/TS source text.
 * Observed only — no type resolution. Not a language server.
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

	// export * from — no local bindings in the exporting file for callsite scan
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

/**
 * Extract import/export/require/dynamic-import string specifiers + clause bindings.
 */
export function extractImports(source: string): ExtractedImport[] {
	const cleaned = stripComments(source);
	const found: ExtractedImport[] = [];
	const seen = new Set<string>();

	const push = (
		specifier: string,
		form: ExtractedImport['form'],
		index: number,
		bindings: ImportBinding[],
	) => {
		const spec = specifier.trim();
		if (!spec) return;
		const key = `${form}\0${spec}`;
		if (seen.has(key)) return;
		seen.add(key);
		found.push({
			specifier: spec,
			form,
			line: lineOf(cleaned, index),
			bindings,
		});
	};

	// import [clause] from 'x'  |  import 'x'
	const importFrom =
		/\bimport\s+(?:type\s+)?(?:([^'";\n]+?)\s+from\s+)?['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = importFrom.exec(cleaned)) !== null) {
		const clause = m[1];
		const bindings = parseImportClause(clause);
		push(m[2]!, 'import', m.index, bindings);
	}

	// export ... from 'x'  |  export * from 'x'
	const exportFrom =
		/\bexport\s+(?:type\s+)?(\*|\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
	while ((m = exportFrom.exec(cleaned)) !== null) {
		const clause = m[1]!;
		const bindings =
			clause === '*'
				? ([{ kind: 'side-effect' }] as ImportBinding[])
				: parseImportClause(clause);
		push(m[2]!, 'export', m.index, bindings);
	}

	// require('x') — binding lives on the left-hand side; not extracted here
	const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((m = requireRe.exec(cleaned)) !== null) {
		push(m[1]!, 'require', m.index, [{ kind: 'side-effect' }]);
	}

	// import('x') dynamic — string literal only
	const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((m = dynRe.exec(cleaned)) !== null) {
		push(m[1]!, 'dynamic', m.index, [{ kind: 'side-effect' }]);
	}

	return found;
}
