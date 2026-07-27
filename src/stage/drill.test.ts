import { describe, expect, it } from 'vitest';
import type { AlluvialNodeRef } from '@core/graph/types.ts';
import {
	drillTargetFromLine,
	drillTargetFromNode,
	isDrillableRef,
} from './drill.ts';

function ref(
	kind: AlluvialNodeRef['kind'],
	id = 'x',
): AlluvialNodeRef {
	return { kind, id };
}

function mapOf(
	entries: Record<string, AlluvialNodeRef>,
): (name: string) => AlluvialNodeRef | null {
	return (name) => entries[name] ?? null;
}

describe('isDrillableRef', () => {
	it('rejects null and bucket', () => {
		expect(isDrillableRef(null)).toBe(false);
		expect(isDrillableRef(undefined)).toBe(false);
		expect(isDrillableRef(ref('bucket'))).toBe(false);
	});

	it('accepts file/package/module/unresolved', () => {
		expect(isDrillableRef(ref('file'))).toBe(true);
		expect(isDrillableRef(ref('package'))).toBe(true);
		expect(isDrillableRef(ref('module'))).toBe(true);
		expect(isDrillableRef(ref('unresolved'))).toBe(true);
	});
});

describe('drillTargetFromNode', () => {
	const refs = mapOf({
		App: ref('file', 'src/App.tsx'),
		Other: ref('bucket', 'other'),
	});

	it('returns name when drillable in drill mode', () => {
		expect(drillTargetFromNode('App', 'drill', refs)).toBe('App');
	});

	it('returns null for bucket', () => {
		expect(drillTargetFromNode('Other', 'drill', refs)).toBe(null);
	});

	it('returns null in inspect mode', () => {
		expect(drillTargetFromNode('App', 'inspect', refs)).toBe(null);
	});

	it('returns null for unknown name', () => {
		expect(drillTargetFromNode('Nope', 'drill', refs)).toBe(null);
	});
});

describe('drillTargetFromLine', () => {
	const refs = mapOf({
		'App.tsx': ref('file', 'src/App.tsx'),
		'util.ts': ref('file', 'src/util.ts'),
		react: ref('package', 'react'),
		'node:fs': ref('unresolved', 'node:fs'),
		mod: ref('module', 'mod'),
		Other: ref('bucket', 'other'),
	});

	it('prefers file target', () => {
		expect(
			drillTargetFromLine('react', 'App.tsx', 'drill', refs),
		).toBe('App.tsx');
		// file target beats file source
		expect(
			drillTargetFromLine('util.ts', 'App.tsx', 'drill', refs),
		).toBe('App.tsx');
	});

	it('prefers package/unresolved source over package target', () => {
		expect(
			drillTargetFromLine('react', 'Other', 'drill', refs),
		).toBe('react');
		expect(
			drillTargetFromLine('node:fs', 'Other', 'drill', refs),
		).toBe('node:fs');
	});

	it('prefers module source', () => {
		expect(drillTargetFromLine('mod', 'Other', 'drill', refs)).toBe('mod');
	});

	it('falls back to package/unresolved/module target', () => {
		expect(
			drillTargetFromLine('Other', 'react', 'drill', refs),
		).toBe('react');
		expect(
			drillTargetFromLine('Other', 'mod', 'drill', refs),
		).toBe('mod');
	});

	it('falls back to file source when no better target', () => {
		expect(
			drillTargetFromLine('App.tsx', 'Other', 'drill', refs),
		).toBe('App.tsx');
	});

	it('returns null in inspect mode (priority unused)', () => {
		expect(
			drillTargetFromLine('react', 'App.tsx', 'inspect', refs),
		).toBe(null);
	});

	it('returns null when neither endpoint is drillable', () => {
		expect(
			drillTargetFromLine('Other', 'Other', 'drill', refs),
		).toBe(null);
		expect(drillTargetFromLine(null, null, 'drill', refs)).toBe(null);
	});
});
