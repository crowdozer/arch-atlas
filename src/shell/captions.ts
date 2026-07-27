/**
 * Pure caption / status strings for atlas views (no DOM).
 */
import type { AtlasView } from '@shell/atlasView.ts';

export function captionForView(view: AtlasView, vizMaxDepth: number): string {
	switch (view.type) {
		case 'file-hub':
			return vizMaxDepth > 1
				? `Imports×${vizMaxDepth} → ${view.fileId} → Exports×${vizMaxDepth}`
				: `Imports → ${view.fileId} → Exports`;
		case 'package':
			return `Package · ${view.label} → imports`;
		case 'module':
			return `Module ends · ${view.moduleId}`;
	}
}

export function statusForView(view: AtlasView): string {
	switch (view.type) {
		case 'file-hub':
			return `Imports · Exports · ${view.fileId}`;
		case 'package':
			return `Package: ${view.label}`;
		case 'module':
			return `Module: ${view.moduleId}`;
	}
}

export function emptyPayloadStatus(view: AtlasView): string {
	if (view.type === 'package') return `No importers for ${view.label}`;
	if (view.type === 'module') return `No package edges in ${view.moduleId}`;
	return `No hub edges for ${view.fileId}`;
}
