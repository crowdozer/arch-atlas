import { describe, expect, it } from 'vitest';
import {
	extractImports,
	parseImportClause,
	stripComments,
} from '@core/parse/imports.ts';

describe('extractImports', () => {
	it('finds static import, export-from, require, and dynamic import', () => {
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
		const specs = imps.map((i) => i.specifier).sort();
		expect(specs).toContain('./a');
		expect(specs).toContain('./b');
		expect(specs).toContain('side-effect');
		expect(specs).toContain('../x');
		expect(specs).toContain('../y');
		expect(specs).toContain('zod');
		expect(specs).toContain('node:fs');
		expect(specs).not.toContain('./commented');
		expect(specs).not.toContain('./block');
	});

	it('extracts named, default, namespace, and side-effect bindings', () => {
		const imps = extractImports(`
import { a, b as c } from './named';
import def from './def';
import * as ns from './ns';
import './side';
`);
		const by = Object.fromEntries(imps.map((i) => [i.specifier, i.bindings]));
		expect(by['./named']).toEqual([
			{ kind: 'named', imported: 'a', local: 'a' },
			{ kind: 'named', imported: 'b', local: 'c' },
		]);
		expect(by['./def']).toEqual([{ kind: 'default', local: 'def' }]);
		expect(by['./ns']).toEqual([{ kind: 'namespace', local: 'ns' }]);
		expect(by['./side']).toEqual([{ kind: 'side-effect' }]);
	});

	it('stripComments preserves strings with //', () => {
		const s = stripComments(`const u = "http://x"; // trail`);
		expect(s).toContain('http://x');
		expect(s).not.toContain('trail');
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
