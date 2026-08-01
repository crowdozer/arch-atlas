/**
 * Level-1 static import extraction from Python source text.
 * Observed only - no type resolution, importlib, or site-packages.
 * Hand-rolled (not Tree-sitter). Best-effort comment/string strip.
 */

import type { ExtractedImport, ImportBinding } from '@core/graph/types.ts';

/**
 * Strip `#` comments and triple-quoted / single-line strings best-effort.
 * Does not pretend perfect lexing (f-strings, nested quotes edge cases).
 */
export function stripPythonNoise(source: string): string {
	let out = '';
	let i = 0;
	const n = source.length;
	type State = 'code' | 'squote' | 'dquote' | 'comment' | 'tquote' | 'tdquote';
	let state: State = 'code';

	while (i < n) {
		const c = source[i]!;
		const next2 = source.slice(i, i + 3);

		if (state === 'code') {
			if (c === '#') {
				state = 'comment';
				i++;
				continue;
			}
			if (next2 === "'''") {
				state = 'tquote';
				out += '   ';
				i += 3;
				continue;
			}
			if (next2 === '"""') {
				state = 'tdquote';
				out += '   ';
				i += 3;
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
			out += c;
			i++;
			continue;
		}

		if (state === 'comment') {
			if (c === '\n') {
				state = 'code';
				out += c;
			}
			i++;
			continue;
		}

		if (state === 'tquote') {
			if (next2 === "'''") {
				state = 'code';
				out += '   ';
				i += 3;
				continue;
			}
			if (c === '\n') out += c;
			else out += ' ';
			i++;
			continue;
		}

		if (state === 'tdquote') {
			if (next2 === '"""') {
				state = 'code';
				out += '   ';
				i += 3;
				continue;
			}
			if (c === '\n') out += c;
			else out += ' ';
			i++;
			continue;
		}

		// single-line string
		out += c;
		if (c === '\\' && i + 1 < n) {
			out += source[i + 1];
			i += 2;
			continue;
		}
		if (state === 'squote' && c === "'") state = 'code';
		else if (state === 'dquote' && c === '"') state = 'code';
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

/** Parse `a as b, c, d as e` name list (not `*`). */
function parseFromNames(body: string): ImportBinding[] {
	const trimmed = body.trim();
	if (!trimmed) return [];
	if (trimmed === '*') return [{ kind: 'side-effect' }];

	const out: ImportBinding[] = [];
	for (const raw of body.split(',')) {
		const part = raw.trim();
		if (!part) continue;
		const asMatch = /^([A-Za-z_][\w.]*)\s+as\s+([A-Za-z_]\w*)$/.exec(part);
		if (asMatch) {
			out.push({
				kind: 'named',
				imported: asMatch[1]!,
				local: asMatch[2]!,
			});
			continue;
		}
		const nameMatch = /^([A-Za-z_][\w.]*)$/.exec(part);
		if (nameMatch) {
			const name = nameMatch[1]!;
			out.push({ kind: 'named', imported: name, local: name });
		}
	}
	return out;
}

/**
 * Extract static `import` / `from … import` statements.
 * Specifiers use dotted module paths; relative uses leading dots (`.foo`, `..pkg`).
 * `from . import x` → specifier `.x` (submodule edge).
 */
export function extractPythonImports(source: string): ExtractedImport[] {
	const cleaned = stripPythonNoise(source);
	const found: ExtractedImport[] = [];
	const seen = new Set<string>();

	const push = (
		specifier: string,
		index: number,
		bindings: ImportBinding[],
	) => {
		const spec = specifier.trim();
		if (!spec) return;
		// Dedup by module specifier only
		const modKey = `import\0${spec}`;
		if (seen.has(modKey)) return;
		seen.add(modKey);
		found.push({
			specifier: spec,
			form: 'import',
			line: lineOf(cleaned, index),
			bindings,
		});
	};

	// from REL import BODY - REL is dots + optional dotted name
	const fromRe = /\bfrom\s+([.\w]+)\s+import\s+/g;
	let m: RegExpExecArray | null;
	while ((m = fromRe.exec(cleaned)) !== null) {
		const mod = m[1]!;
		let bodyStart = m.index + m[0].length;
		let body: string;
		if (cleaned[bodyStart] === '(') {
			const close = cleaned.indexOf(')', bodyStart + 1);
			if (close < 0) continue;
			body = cleaned.slice(bodyStart + 1, close);
		} else {
			// rest of line (or until comment already stripped)
			const nl = cleaned.indexOf('\n', bodyStart);
			body = cleaned.slice(bodyStart, nl < 0 ? cleaned.length : nl);
		}

		const names = body.trim();
		// Relative package-only: from . import x,y → one edge per name as submodule
		if (/^\.+$/.test(mod)) {
			if (names === '*') {
				push(mod, m.index, [{ kind: 'side-effect' }]);
				continue;
			}
			for (const raw of names.split(',')) {
				const part = raw.trim();
				if (!part || part === '*') continue;
				const asMatch = /^([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)$/.exec(part);
				const name = asMatch ? asMatch[1]! : /^([A-Za-z_]\w*)/.exec(part)?.[1];
				if (!name) continue;
				const local = asMatch ? asMatch[2]! : name;
				push(`${mod}${name}`, m.index, [
					{ kind: 'named', imported: name, local },
				]);
			}
			continue;
		}

		const bindings = parseFromNames(names);
		push(mod, m.index, bindings.length ? bindings : [{ kind: 'side-effect' }]);
	}

	// import a, b as c, d.e
	const importRe = /^\s*import\s+([^\n#]+)/gm;
	while ((m = importRe.exec(cleaned)) !== null) {
		// Skip if this line is part of from-import (already handled) - `import` after from
		// is not matched by this because from-lines start with `from`.
		const list = m[1]!;
		for (const raw of list.split(',')) {
			const part = raw.trim();
			if (!part) continue;
			const asMatch = /^([A-Za-z_][\w.]*)\s+as\s+([A-Za-z_]\w*)$/.exec(part);
			if (asMatch) {
				const mod = asMatch[1]!;
				const local = asMatch[2]!;
				push(mod, m.index, [{ kind: 'namespace', local }]);
				continue;
			}
			const nameMatch = /^([A-Za-z_][\w.]*)$/.exec(part);
			if (nameMatch) {
				const mod = nameMatch[1]!;
				const top = mod.split('.')[0]!;
				push(mod, m.index, [{ kind: 'namespace', local: top }]);
			}
		}
	}

	// Sort by line for stable output
	found.sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier));
	return found;
}
