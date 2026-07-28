import { describe, expect, it } from 'vitest';
import type { AtlasView } from '@shell/atlasView.ts';
import {
	captionForView,
	emptyPayloadStatus,
	statusForView,
} from '@shell/captions.ts';

const fileHub: AtlasView = { type: 'file-hub', fileId: 'src/a.ts' };
const packageHub: AtlasView = { type: 'package-hub', packageId: 'nodemailer' };
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

	it('package-hub depth 1 omits × multiplier', () => {
		expect(captionForView(packageHub, 1)).toBe('Exports → nodemailer');
	});

	it('package-hub depth >1 includes × multiplier', () => {
		expect(captionForView(packageHub, 3)).toBe('Exports×3 → nodemailer');
	});

	it('module caption', () => {
		expect(captionForView(mod, 3)).toBe('Module ends · src');
	});
});

describe('statusForView / emptyPayloadStatus', () => {
	it('status strings per view type', () => {
		expect(statusForView(fileHub)).toBe('Imports · Exports · src/a.ts');
		expect(statusForView(packageHub)).toBe('Package hub · nodemailer');
		expect(statusForView(mod)).toBe('Module: src');
	});

	it('empty payload status per view type', () => {
		expect(emptyPayloadStatus(fileHub)).toBe('No hub edges for src/a.ts');
		expect(emptyPayloadStatus(packageHub)).toBe('No importers for nodemailer');
		expect(emptyPayloadStatus(mod)).toBe('No package edges in src');
	});
});
