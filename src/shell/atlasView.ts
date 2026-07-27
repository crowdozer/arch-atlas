/**
 * Pure atlas navigation view model (stack predicates / open policy).
 * No DOM. Stack mutation + chrome commit stay in the host composition root.
 *
 * ## Navigation model
 * `viewStack` is the sole owner of “where we are.” Session `startId` (tree /
 * catalog selection + persist) is **derived** as the nearest file-hub frame on
 * the stack — never updated as a parallel lifecycle.
 */
import { HUB_DEFAULT_MAX_DEPTH } from '@core/index.ts';

/**
 * Nested alluvial focus (top of stack = current view).
 * File opens are always file-hub traversal; package/module are drill-only.
 */
export type AtlasView =
	/** Dual hub: importers → file → exporters (sole file projector). */
	| { type: 'file-hub'; fileId: string }
	| { type: 'package'; packageId: string; label: string }
	| { type: 'module'; moduleId: string };

/** Top of stack, or null when empty. */
export function topOfStack(stack: readonly AtlasView[]): AtlasView | null {
	return stack.length ? stack[stack.length - 1]! : null;
}

export function sameView(a: AtlasView, b: AtlasView): boolean {
	if (a.type !== b.type) return false;
	if (a.type === 'file-hub' && b.type === 'file-hub') {
		return a.fileId === b.fileId;
	}
	if (a.type === 'package' && b.type === 'package') {
		return a.packageId === b.packageId;
	}
	if (a.type === 'module' && b.type === 'module') {
		return a.moduleId === b.moduleId;
	}
	return false;
}

/**
 * File focus for tree/catalog/persist: nearest file-hub frame under the stack
 * top (package/module drills keep the underlying file selected).
 */
export function nearestFileFocus(stack: readonly AtlasView[]): string | null {
	for (let i = stack.length - 1; i >= 0; i--) {
		const v = stack[i]!;
		if (v.type === 'file-hub') return v.fileId;
	}
	return null;
}

/** Sole file open policy: always file-hub traversal (startId only; one projector). */
export function viewForFileOpen(fileId: string): AtlasView {
	return { type: 'file-hub', fileId };
}

/** Depth control is meaningful only for file-hub dual BFS radius. */
export function viewUsesDepth(view: AtlasView | null): boolean {
	return view?.type === 'file-hub';
}

/** Default viz depth for file-hub (package/module ignore depth). */
export function defaultDepthForView(_view: AtlasView): number {
	return HUB_DEFAULT_MAX_DEPTH;
}
