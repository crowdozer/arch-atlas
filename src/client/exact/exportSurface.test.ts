import { describe, expect, it } from 'vitest';
import {
	collectExportSpansFromText,
	massForBindings,
	pickSpansForBindings,
} from './exportSurface.ts';

describe('collectExportSpansFromText', () => {
	it('finds named function/const exports with line spans', () => {
		const text = [
			'export function used() {',
			'  return 1;',
			'}',
			'export const x = 2;',
			'const local = 3;',
		].join('\n');
		const spans = collectExportSpansFromText(text);
		const names = spans.map((s) => s.name).sort();
		expect(names).toEqual(['used', 'x']);
		const used = spans.find((s) => s.name === 'used')!;
		expect(used.startLine).toBe(1);
		expect(used.endLine).toBe(3);
	});

	it('finds default export', () => {
		const spans = collectExportSpansFromText('export default function App() {}\n');
		expect(spans.some((s) => s.kind === 'default')).toBe(true);
	});

	it('parses export { a, b as c }', () => {
		const spans = collectExportSpansFromText('export { a, b as c };\n');
		const names = spans.map((s) => s.name).sort();
		expect(names).toEqual(['a', 'c']);
	});
});

describe('massForBindings', () => {
	const spans = collectExportSpansFromText(
		[
			'export function used() {',
			'  return 1;',
			'}',
			'export function unused() {',
			'  return 2;',
			'  // pad',
			'}',
			'export default class X {}',
		].join('\n'),
	);

	it('side-effect only → 1', () => {
		expect(massForBindings([{ kind: 'side-effect' }], spans)).toBe(1);
	});

	it('named match uses export span not whole file', () => {
		const mass = massForBindings(
			[{ kind: 'named', imported: 'used', local: 'used' }],
			spans,
		);
		expect(mass).not.toBeNull();
		expect(mass!).toBeLessThanOrEqual(3);
		expect(mass!).toBeGreaterThanOrEqual(1);
	});

	it('unresolved named → null', () => {
		expect(
			massForBindings(
				[{ kind: 'named', imported: 'missing', local: 'missing' }],
				spans,
			),
		).toBeNull();
	});

	it('default binding matches default span', () => {
		const mass = massForBindings([{ kind: 'default', local: 'X' }], spans);
		expect(mass).not.toBeNull();
		expect(mass!).toBeGreaterThanOrEqual(1);
	});

	it('namespace uses union of export spans', () => {
		const mass = massForBindings([{ kind: 'namespace', local: 'ns' }], spans);
		expect(mass).not.toBeNull();
		expect(mass!).toBeGreaterThan(1);
	});

	it('namespace with no spans → null', () => {
		expect(massForBindings([{ kind: 'namespace', local: 'ns' }], [])).toBeNull();
	});
});

describe('pickSpansForBindings', () => {
	const spans = collectExportSpansFromText(
		'export function foo() {}\nexport function bar() {}\n',
	);

	it('picks matching named spans', () => {
		const picked = pickSpansForBindings(
			[{ kind: 'named', imported: 'foo', local: 'foo' }],
			spans,
		);
		expect(picked).toHaveLength(1);
		expect(picked[0]!.name).toBe('foo');
	});

	it('side-effect import picks no spans (do not dump all exports)', () => {
		const picked = pickSpansForBindings([{ kind: 'side-effect' }], spans);
		expect(picked).toEqual([]);
	});
});
