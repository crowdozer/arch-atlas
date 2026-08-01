/**
 * Cross-lang L1 false-positive class matrix.
 *
 * Enforceable table: each admitted language implements extract/resolve checks
 * for a class or marks N/A. New languages must add a column (row coverage).
 *
 * Detailed homes remain imports.test / pythonImports.test / astroImports.test
 * "L1 false-positive guards"; this matrix is the index + minimal re-runs.
 *
 * Optional light lex soup: deterministic loops (no fast-check).
 */
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@core/graph/build.ts';
import { extractAstroImports } from '@core/parse/astroImports.ts';
import { extractImports } from '@core/parse/imports.ts';
import {
	collectGarbageExternals,
	isKnownGarbageSpecifier,
} from '@core/parse/l1GarbageSpec.ts';
import { extractPythonImports } from '@core/parse/pythonImports.ts';
import { resolveSpecifier } from '@core/parse/resolve.ts';

/** Admitted L1 languages for matrix coverage. */
const ADMITTED_LANGS = ['js-ts', 'python', 'astro'] as const;
type Lang = (typeof ADMITTED_LANGS)[number];

type MatrixStatus = 'implements' | 'N/A';

type MatrixRow = {
	id: string;
	class: string;
	/** Per-language status; every ADMITTED_LANGS key required */
	status: Record<Lang, MatrixStatus>;
	notes?: string;
	/** Extract/resolve checks for languages marked implements */
	run?: Partial<Record<Lang, () => void>>;
};

function specsOf(
	imps: { specifier: string }[],
): string[] {
	return imps.map((i) => i.specifier);
}

const MATRIX: MatrixRow[] = [
	{
		id: 'keyword-in-string',
		class: 'import keyword inside string (union form / docs)',
		status: {
			'js-ts': 'implements',
			python: 'implements',
			astro: 'N/A', // via js-ts islands; HTML body is keyword-in-html-template
		},
		notes: "Historic product `|` class from form: 'import' | 'export'",
		run: {
			'js-ts': () => {
				const src = `
form: 'import' | 'export' | 'require' | 'dynamic';
import { a } from './a';
`;
				const specs = specsOf(extractImports(src));
				expect(specs).not.toContain('|');
				expect(specs).not.toContain('export');
				expect(specs).toContain('./a');
				expect(specs.every((s) => !isKnownGarbageSpecifier(s))).toBe(true);
			},
			python: () => {
				// Python strings with import lookalikes (non-triple already covered by #/""")
				const src = `
s = "import not_real"
from pkg.a import run
`;
				const specs = specsOf(extractPythonImports(src));
				expect(specs).not.toContain('not_real');
				expect(specs).toContain('pkg.a');
			},
		},
	},
	{
		id: 'keyword-in-comment',
		class: 'import lookalike in comments',
		status: {
			'js-ts': 'implements',
			python: 'implements',
			astro: 'implements',
		},
		run: {
			'js-ts': () => {
				const src = `
// import { no } from './commented';
/* import { no2 } from './block'; */
import { a } from './a';
`;
				expect(specsOf(extractImports(src))).toEqual(['./a']);
			},
			python: () => {
				const src = `
# import commented_out
# from fake import x
import os
`;
				const specs = specsOf(extractPythonImports(src));
				expect(specs).toContain('os');
				expect(specs).not.toContain('commented_out');
				expect(specs).not.toContain('fake');
			},
			astro: () => {
				// Frontmatter comments use JS extract; body HTML is separate class
				const src = `---
// import { no } from './commented';
import Layout from '../layouts/Layout.astro';
---
<p>ok</p>
`;
				const specs = specsOf(extractAstroImports(src));
				expect(specs).toEqual(['../layouts/Layout.astro']);
				expect(specs).not.toContain('./commented');
			},
		},
	},
	{
		id: 'keyword-in-template',
		class: 'import keyword inside JS/TS template literal',
		status: {
			'js-ts': 'implements',
			python: 'N/A',
			astro: 'N/A',
		},
		run: {
			'js-ts': () => {
				const src = `
const s = \`form: 'import' | 'export'\`;
import { x } from './x';
`;
				expect(specsOf(extractImports(src))).toEqual(['./x']);
			},
		},
	},
	{
		id: 'keyword-in-html-template',
		class: 'import lookalike in Astro HTML body (not script island)',
		status: {
			'js-ts': 'N/A',
			python: 'N/A',
			astro: 'implements',
		},
		run: {
			astro: () => {
				const src = `---
import Layout from '../layouts/Layout.astro';
---
<html>
  <p>Docs: import { x } from './fake'</p>
  <code>import Button from './Button.astro'</code>
</html>
`;
				const specs = specsOf(extractAstroImports(src));
				expect(specs).toEqual(['../layouts/Layout.astro']);
				expect(specs).not.toContain('./fake');
				expect(specs).not.toContain('./Button.astro');
			},
		},
	},
	{
		id: 'tooling-suffix-worker',
		class: '?worker / resource query not painted as package',
		status: {
			'js-ts': 'implements',
			python: 'N/A',
			astro: 'implements', // resolve family js-ts
		},
		notes: 'edge.specifier may retain query; package name must not',
		run: {
			'js-ts': () => {
				const files = new Set(['src/lib/worker-target.ts', 'src/entry.ts']);
				const r = resolveSpecifier(
					'src/entry.ts',
					'./lib/worker-target.ts?worker',
					files,
					null,
				);
				expect(r).toEqual({ kind: 'file', path: 'src/lib/worker-target.ts' });

				const graph = buildGraph([
					{
						path: 'src/entry.ts',
						content: `import Worker from './lib/worker-target.ts?worker';\n`,
						byteLength: 50,
					},
					{
						path: 'src/lib/worker-target.ts',
						content: 'export {}\n',
						byteLength: 10,
					},
				]);
				expect(graph.packages.has('?worker')).toBe(false);
				expect(
					[...graph.packages.keys()].every((n) => !n.includes('?')),
				).toBe(true);
				expect(collectGarbageExternals(graph)).toEqual([]);
				const edge = graph.edges.find((e) => e.to === 'src/lib/worker-target.ts');
				expect(edge?.toKind).toBe('file');
			},
			astro: () => {
				// Same resolve family - relative ?worker strips
				const files = new Set(['src/w.ts', 'src/p.astro']);
				const r = resolveSpecifier(
					'src/p.astro',
					'./w.ts?worker',
					files,
					null,
				);
				expect(r).toEqual({ kind: 'file', path: 'src/w.ts' });
			},
		},
	},
	{
		id: 'self-scan-push-import-arg',
		class: "form-arg / code soup harvest ([{ kind: / 'import' arg)",
		status: {
			'js-ts': 'implements',
			python: 'N/A',
			astro: 'N/A',
		},
		run: {
			'js-ts': () => {
				const src = `
push(cleaned.slice(j + 1, end), 'import', idx, [{ kind: 'side-effect' }], false);
import './real';
`;
				const specs = specsOf(extractImports(src));
				expect(specs.some((s) => s.includes('idx') || s.includes('kind:'))).toBe(
					false,
				);
				expect(specs).toContain('./real');
				expect(specs.every((s) => !isKnownGarbageSpecifier(s))).toBe(true);
			},
		},
	},
	{
		id: 'importlib-dynamic-nonclaim',
		class: 'importlib / __import__ dynamic targets not harvested',
		status: {
			'js-ts': 'N/A',
			python: 'implements',
			astro: 'N/A',
		},
		run: {
			python: () => {
				const src = `
import importlib
mod = importlib.import_module("dyn_pkg")
__import__("dyn_x")
from pkg.a import run
`;
				const specs = specsOf(extractPythonImports(src));
				expect(specs).toContain('importlib');
				expect(specs).toContain('pkg.a');
				expect(specs).not.toContain('dyn_pkg');
				expect(specs).not.toContain('dyn_x');
			},
		},
	},
];

describe('L1 FP class matrix (admitted languages)', () => {
	it('every matrix row covers all admitted languages', () => {
		for (const row of MATRIX) {
			for (const lang of ADMITTED_LANGS) {
				expect(
					row.status[lang],
					`${row.id}: missing status for ${lang}`,
				).toMatch(/^(implements|N\/A)$/);
			}
		}
	});

	it('every implements cell has a run() and N/A has none required', () => {
		for (const row of MATRIX) {
			for (const lang of ADMITTED_LANGS) {
				if (row.status[lang] === 'implements') {
					expect(
						typeof row.run?.[lang],
						`${row.id}/${lang}: implements without run()`,
					).toBe('function');
				}
			}
		}
	});

	for (const row of MATRIX) {
		describe(row.id, () => {
			for (const lang of ADMITTED_LANGS) {
				const status = row.status[lang];
				if (status === 'N/A') {
					it(`${lang}: marked N/A`, () => {
						expect(status).toBe('N/A');
					});
				} else {
					it(`${lang}: implements ${row.class}`, () => {
						row.run![lang]!();
					});
				}
			}
		});
	}
});

/**
 * Light lex soup - deterministic comment/string wrappers around import lookalikes.
 * Cap ~20–40 cases; no fast-check dependency.
 */
describe('L1 lex soup (light)', () => {
	/** Escape so lookalike stays inside the outer string delimiter. */
	function escapeFor(quote: '"' | "'" | '`', inner: string): string {
		if (quote === '`') return inner.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
		return inner
			.replace(/\\/g, '\\\\')
			.replace(new RegExp(quote, 'g'), `\\${quote}`);
	}

	type JsWrap = { id: string; build: (inner: string) => string };

	const wrappersJs: JsWrap[] = [
		{ id: 'line-comment', build: (inner) => `// ${inner}\nimport './real';\n` },
		{ id: 'block-comment', build: (inner) => `/* ${inner} */\nimport './real';\n` },
		{
			id: 'dquote',
			build: (inner) => `const s = "${escapeFor('"', inner)}";\nimport './real';\n`,
		},
		{
			id: 'squote',
			build: (inner) => `const s = '${escapeFor("'", inner)}';\nimport './real';\n`,
		},
		{
			id: 'template',
			build: (inner) => `const s = \`${escapeFor('`', inner)}\`;\nimport './real';\n`,
		},
	];

	const lookalikes = [
		"import { x } from './fake'",
		"import './side'",
		"form: 'import' | 'export'",
		"from './nope'",
		"require('./cjs')",
		"import type { T } from './t'",
		'export { y } from "./exp"',
		'import("./dyn")',
	];

	it('js-ts: comment/string soup never yields garbage specs; real edge kept', () => {
		let n = 0;
		for (const wrap of wrappersJs) {
			for (const look of lookalikes) {
				const src = wrap.build(look);
				const imps = extractImports(src);
				const specs = specsOf(imps);
				expect(specs, `${wrap.id}: ${src}`).toContain('./real');
				expect(
					specs.filter((s) => s !== './real'),
					`extra specs from soup (${wrap.id}):\n${src}\n→ ${JSON.stringify(specs)}`,
				).toEqual([]);
				expect(specs.every((s) => !isKnownGarbageSpecifier(s))).toBe(true);
				n++;
			}
		}
		expect(n).toBeGreaterThanOrEqual(20);
		expect(n).toBeLessThanOrEqual(50);
	});

	it('python: # / triple-quote soup never harvests lookalikes; real import kept', () => {
		const pyLooks = [
			'import not_real',
			'from fake import x',
			'from .ghost import z',
		];
		const wrappers = [
			(inner: string) => `# ${inner}\nimport os\n`,
			(inner: string) => `"""\n${inner}\n"""\nimport os\n`,
			(inner: string) => `'''\n${inner}\n'''\nimport os\n`,
		];
		let n = 0;
		for (const wrap of wrappers) {
			for (const look of pyLooks) {
				const src = wrap(look);
				const specs = specsOf(extractPythonImports(src));
				expect(specs, src).toContain('os');
				expect(specs, src).not.toContain('not_real');
				expect(specs, src).not.toContain('fake');
				expect(specs, src).not.toContain('.ghost');
				n++;
			}
		}
		expect(n).toBe(9);
	});
});
