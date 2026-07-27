import { describe, expect, it } from 'vitest';
import {
	extractPythonImports,
	stripPythonNoise,
} from '@core/parse/pythonImports.ts';

function bySpecifier(imps: ReturnType<typeof extractPythonImports>) {
	return Object.fromEntries(
		imps.map((i) => [i.specifier, { form: i.form, bindings: i.bindings }]),
	);
}

describe('stripPythonNoise', () => {
	it('removes # comments and keeps newlines', () => {
		const s = stripPythonNoise('import a  # hi\nimport b\n');
		expect(s).toContain('import a');
		expect(s).toContain('import b');
		expect(s).not.toContain('hi');
	});

	it('blanks triple-quoted strings', () => {
		const s = stripPythonNoise('x = """import fake\\nfrom y import z"""\nimport real\n');
		expect(s).toContain('import real');
		expect(s).not.toMatch(/import fake/);
	});
});

describe('extractPythonImports', () => {
	it('finds import, from-import, alias, star, and relative forms', () => {
		const src = `
import os
import a.b
import requests as req
from pkg.b import helper, util as u
from pkg import *
from . import sibling
from ..other import x
from .sub import y
# import commented
"""
import not_real
"""
`;
		const imps = extractPythonImports(src);
		const by = bySpecifier(imps);

		expect(by['os']).toEqual({
			form: 'import',
			bindings: [{ kind: 'namespace', local: 'os' }],
		});
		expect(by['a.b']).toEqual({
			form: 'import',
			bindings: [{ kind: 'namespace', local: 'a' }],
		});
		expect(by['requests']).toEqual({
			form: 'import',
			bindings: [{ kind: 'namespace', local: 'req' }],
		});
		expect(by['pkg.b']).toEqual({
			form: 'import',
			bindings: [
				{ kind: 'named', imported: 'helper', local: 'helper' },
				{ kind: 'named', imported: 'util', local: 'u' },
			],
		});
		expect(by['pkg']).toEqual({
			form: 'import',
			bindings: [{ kind: 'side-effect' }],
		});
		expect(by['.sibling']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'sibling', local: 'sibling' }],
		});
		expect(by['..other']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'x', local: 'x' }],
		});
		expect(by['.sub']).toEqual({
			form: 'import',
			bindings: [{ kind: 'named', imported: 'y', local: 'y' }],
		});
		expect(by['commented']).toBeUndefined();
		expect(by['not_real']).toBeUndefined();
	});

	it('handles parenthesized multi-line from-import', () => {
		const imps = extractPythonImports(`
from pkg.mod import (
    alpha,
    beta as b,
)
`);
		const by = bySpecifier(imps);
		expect(by['pkg.mod']?.bindings).toEqual([
			{ kind: 'named', imported: 'alpha', local: 'alpha' },
			{ kind: 'named', imported: 'beta', local: 'b' },
		]);
	});

	it('does not invent importlib/dynamic forms', () => {
		const imps = extractPythonImports(`
import importlib
mod = importlib.import_module("dyn")
__import__("x")
`);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toContain('importlib');
		expect(specs).not.toContain('dyn');
		expect(specs).not.toContain('x');
	});
});
