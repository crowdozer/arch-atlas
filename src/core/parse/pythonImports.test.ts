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

/**
 * L1 false-positive guards — product-proven extract noise classes.
 * Each case pairs negatives (comment/string lookalikes) with real imports
 * in the same source (prevents "strip everything" regressions).
 */
describe('L1 false-positive guards', () => {
	it('ignores # comment and triple-quote lookalikes while keeping real edges', () => {
		const src = `
import os
from pkg.b import helper
# import commented_out
# from fake import x
"""
import not_real
from nowhere import y
"""
from . import sibling
`;
		const imps = extractPythonImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toContain('os');
		expect(specs).toContain('pkg.b');
		expect(specs).toContain('.sibling');
		expect(specs).not.toContain('commented_out');
		expect(specs).not.toContain('fake');
		expect(specs).not.toContain('not_real');
		expect(specs).not.toContain('nowhere');
	});

	it('ignores single-quoted triple-string lookalikes with real relative coexisting', () => {
		const src = `
'''
import phantom
from .ghost import z
'''
from .sub import y
`;
		const imps = extractPythonImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toEqual(['.sub']);
		expect(specs).not.toContain('phantom');
		expect(specs).not.toContain('.ghost');
	});

	it('does not harvest importlib dynamic targets (honesty non-claim)', () => {
		const src = `
import importlib
mod = importlib.import_module("dyn_pkg")
__import__("dyn_x")
from pkg.a import run
`;
		const imps = extractPythonImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toContain('importlib');
		expect(specs).toContain('pkg.a');
		expect(specs).not.toContain('dyn_pkg');
		expect(specs).not.toContain('dyn_x');
	});
});
