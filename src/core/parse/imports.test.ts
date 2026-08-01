import { describe, expect, it } from 'vitest';
import {
	extractImports,
	parseImportClause,
	stripComments,
} from '@core/parse/imports.ts';

/** Map specifier → { form, bindings, typeOnly? } for golden snapshots (first win if dup). */
function bySpecifier(imps: ReturnType<typeof extractImports>) {
	return Object.fromEntries(
		imps.map((i) => [
			i.specifier,
			{
				form: i.form,
				bindings: i.bindings,
				...(i.typeOnly ? { typeOnly: true } : {}),
			},
		]),
	);
}

describe('extractImports', () => {
	it('finds static import, export-from, require, and dynamic import (full golden)', () => {
		const src = `
import { a } from './a';
import type { B } from "./b";
import 'side-effect';
export { x } from '../x';
export * from "../y";
const z = require('zod');
const d = import('node:fs');
// import { no } from './commented';
/* import { no2 } from './block'; */
`;
		const imps = extractImports(src);
		const by = bySpecifier(imps);

		expect(by['./a']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'a', local: 'a' }],
		});
		expect(by['./b']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'B', local: 'B' }],
			typeOnly: true,
		});
		expect(by['side-effect']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});
		expect(by['../x']).toEqual({
			form: 'export',
			bindings: [{ kind: 'named', imported: 'x', local: 'x' }],
		});
		expect(by['../y']).toEqual({
			form: 'export',
			bindings: [{ kind: 'side-effect' }],
		});
		expect(by['zod']).toEqual({
			form: 'require',
			bindings: [{ kind: 'side-effect' }],
		});
		expect(by['node:fs']).toEqual({
			form: 'dynamic',
			bindings: [{ kind: 'side-effect' }],
		});
		expect(by['./commented']).toBeUndefined();
		expect(by['./block']).toBeUndefined();

		const specs = imps.map((i) => i.specifier).sort();
		expect(specs).toEqual(
			['../x', '../y', './a', './b', 'node:fs', 'side-effect', 'zod'].sort(),
		);
		expect(imps.find((i) => i.specifier === './b')?.typeOnly).toBe(true);
	});

	it('marks export type … from as typeOnly', () => {
		const imps = extractImports(`export type { T } from './types';\nexport { V } from './val';\n`);
		expect(imps.find((i) => i.specifier === './types')?.typeOnly).toBe(true);
		expect(imps.find((i) => i.specifier === './val')?.typeOnly).toBeUndefined();
	});

	it('prefers runtime when both import type and value import exist', () => {
		const imps = extractImports(`
import type { A } from './a';
import { A } from './a';
`);
		const a = imps.filter((i) => i.specifier === './a');
		expect(a).toHaveLength(1);
		expect(a[0]!.typeOnly).toBeFalsy();
	});

	it('extracts named, default, namespace, and side-effect bindings (full golden)', () => {
		const imps = extractImports(`
import { a, b as c } from './named';
import def from './def';
import * as ns from './ns';
import './side';
`);
		const by = bySpecifier(imps);
		expect(by['./named']).toEqual({
			form: 'import',
			bindings: [
				{ kind: 'named', imported: 'a', local: 'a' },
				{ kind: 'named', imported: 'b', local: 'c' },
			],
		});
		expect(by['./def']).toEqual({
			form: 'import',
			bindings: [{ kind: 'default', local: 'def' }],
		});
		expect(by['./ns']).toEqual({
			form: 'import',
			bindings: [{ kind: 'namespace', local: 'ns' }],
		});
		expect(by['./side']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});
	});

	it('extracts multi-line named import with bindings', () => {
		const imps = extractImports(`
import {
  a,
  b as c
} from './named';
`);
		expect(bySpecifier(imps)['./named']).toEqual({
			form: 'import',
			bindings: [
				{ kind: 'named', imported: 'a', local: 'a' },
				{ kind: 'named', imported: 'b', local: 'c' },
			],
		});
	});

	it('extracts multi-line import type', () => {
		const imps = extractImports(`
import type {
  B
} from "./b";
`);
		expect(bySpecifier(imps)['./b']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'B', local: 'B' }],
			typeOnly: true,
		});
	});

	it('extracts multi-line default + named', () => {
		const imps = extractImports(`
import def,
{
  x
} from './mixed';
`);
		expect(bySpecifier(imps)['./mixed']).toEqual({
			form: 'import',
			bindings: [
				{ kind: 'default', local: 'def' },
				{ kind: 'named', imported: 'x', local: 'x' },
			],
		});
	});

	it('extracts multi-line namespace import', () => {
		const imps = extractImports(`
import * as ns
  from './ns';
`);
		expect(bySpecifier(imps)['./ns']).toEqual({
			form: 'import',
			bindings: [{ kind: 'namespace', local: 'ns' }],
		});
	});

	it('keeps side-effect import (same-line and after import keyword)', () => {
		const same = extractImports(`import 'side-effect';`);
		expect(bySpecifier(same)['side-effect']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});

		const split = extractImports(`import
'side-effect';`);
		expect(bySpecifier(split)['side-effect']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});
	});

	it('does not treat from inside braces as the module from', () => {
		const imps = extractImports(`
import {
  from as f
} from './a';
`);
		expect(bySpecifier(imps)['./a']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'from', local: 'f' }],
		});
		// same-line form of the footgun
		const sameLine = extractImports(`import { from as f } from './a';`);
		expect(bySpecifier(sameLine)['./a']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'from', local: 'f' }],
		});
	});

	it('extracts multi-line export-from (regression)', () => {
		const imps = extractImports(`
export {
  x,
  y as z
} from '../x';
`);
		expect(bySpecifier(imps)['../x']).toEqual({
			form: 'export',
			bindings: [
				{ kind: 'named', imported: 'x', local: 'x' },
				{ kind: 'named', imported: 'y', local: 'z' },
			],
		});
	});

	it('multi-line vs same-line static import parity (specifier + form + bindings)', () => {
		const sameLine = `
import { a, b as c } from './named';
import type { B } from "./b";
import def, { x } from './mixed';
import * as ns from './ns';
import './side';
import { from as f } from './from-bind';
`;
		const multiLine = `
import {
  a,
  b as c
} from './named';
import type {
  B
} from "./b";
import def,
{
  x
} from './mixed';
import * as ns
  from './ns';
import './side';
import {
  from as f
} from './from-bind';
`;
		const a = bySpecifier(extractImports(sameLine));
		const b = bySpecifier(extractImports(multiLine));
		expect(b).toEqual(a);
	});

	it('stripComments preserves strings with //', () => {
		const s = stripComments(`const u = "http://x"; // trail`);
		expect(s).toContain('http://x');
		expect(s).not.toContain('trail');
	});
});

/**
 * L1 false-positive guards - product-proven extract noise classes.
 * Each case pairs negatives (lookalikes must not edge) with a real import
 * in the same source (prevents "strip everything" regressions).
 */
describe('L1 false-positive guards', () => {
	it('does not latch import inside string literals (union type / form field)', () => {
		// Product false-positive class: form: 'import' | 'export' | … → package '|'
		const src = `
/** static import | export-from | require | dynamic import() */
form: 'import' | 'export' | 'require' | 'dynamic';
import { a } from './a';
import 'side-effect';
`;
		const imps = extractImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).not.toContain('|');
		expect(specs).not.toContain('export');
		expect(specs).not.toContain('require');
		expect(specs).not.toContain('dynamic');
		expect(bySpecifier(imps)['./a']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'a', local: 'a' }],
		});
		expect(bySpecifier(imps)['side-effect']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});
	});

	it('does not treat string form argument as import then harvest following args', () => {
		// Self-scan class: push(..., 'import', idx, [{ kind: 'side-effect' }], …)
		const src = `
push(cleaned.slice(j + 1, end), 'import', idx, [{ kind: 'side-effect' }], false);
import './real';
`;
		const imps = extractImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs.some((s) => s.includes('idx') || s.includes('kind:'))).toBe(false);
		expect(bySpecifier(imps)['./real']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});
	});

	it('skips import keyword inside template literals', () => {
		const src = `
const s = \`form: 'import' | 'export'\`;
import { x } from './x';
`;
		const imps = extractImports(src);
		expect(imps.map((i) => i.specifier)).toEqual(['./x']);
	});

	it('skips import lookalikes in line/block comments while keeping real edge', () => {
		const src = `
// import { no } from './commented';
/* import { no2 } from './block'; */
import { a } from './a';
`;
		const imps = extractImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toEqual(['./a']);
		expect(specs).not.toContain('./commented');
		expect(specs).not.toContain('./block');
	});

	it('does not harvest import keyword mid-line inside a double-quoted string', () => {
		const src = `
const hint = "use import { x } from './fake' in docs";
import { real } from './real';
`;
		const imps = extractImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toEqual(['./real']);
		expect(specs).not.toContain('./fake');
	});

	it('does not harvest require / dynamic import / export-from inside string literals', () => {
		// Regex passes must be string-aware (same class as static import keyword)
		const src = `
const a = "require('./cjs')";
const b = "import('./dyn')";
const c = "export { x } from './exp'";
const d = \`require('./tmpl')\`;
const real = require('./real-req');
const dyn = import('./real-dyn');
export { y } from './real-exp';
`;
		const imps = extractImports(src);
		const specs = imps.map((i) => i.specifier).sort();
		expect(specs).toEqual(['./real-dyn', './real-exp', './real-req'].sort());
		expect(specs).not.toContain('./cjs');
		expect(specs).not.toContain('./dyn');
		expect(specs).not.toContain('./exp');
		expect(specs).not.toContain('./tmpl');
	});
});

describe('parseImportClause', () => {
	it('parses default + named', () => {
		expect(parseImportClause('React, { useState }')).toEqual([
			{ kind: 'default', local: 'React' },
			{ kind: 'named', imported: 'useState', local: 'useState' },
		]);
	});
});
