import { describe, expect, it } from 'vitest';
import type { AtlasView } from '@shell/atlasView.ts';
import {
	captionForView,
	emptyPayloadStatus,
	statusForView,
} from '@shell/captions.ts';

const fileHub: AtlasView = { type: 'file-hub', fileId: 'src/a.ts' };
const pkg: AtlasView = { type: 'package', packageId: 'react', label: 'react' };
const mod: AtlasView = { type: 'module', moduleId: 'src' };

describe('captionForView', () => {
	it('file-hub depth 1 omits × multiplier', () => {
		expect(captionForView(fileHub, 1)).toBe('Imports → src/a.ts → Exports');
	});

	it('file-hub depth >1 includes × multiplier', () => {
		expect(captionForView(fileHub, 3)).toBe(
			'Imports×3 → src/a.ts → Exports×3',
		);
	});

	it('package and module captions', () => {
		expect(captionForView(pkg, 3)).toBe('Package · react → imports');
		expect(captionForView(mod, 3)).toBe('Module ends · src');
	});
});

describe('statusForView / emptyPayloadStatus', () => {
	it('status strings per view type', () => {
		expect(statusForView(fileHub)).toBe('Imports · Exports · src/a.ts');
		expect(statusForView(pkg)).toBe('Package: react');
		expect(statusForView(mod)).toBe('Module: src');
	});

	it('empty payload status per view type', () => {
		expect(emptyPayloadStatus(fileHub)).toBe('No hub edges for src/a.ts');
		expect(emptyPayloadStatus(pkg)).toBe('No importers for react');
		expect(emptyPayloadStatus(mod)).toBe('No package edges in src');
	});
});
