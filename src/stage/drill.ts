/**
 * Pure drill-target resolution for hub alluvial clicks + hover cyan.
 * Host owns InteractionMode; stage owns payload ref lookup + priority law.
 */

import type { AlluvialNodeRef } from '@core/graph/types.ts';
import type { InteractionMode } from '@shell/types.ts';

export function isDrillableRef(
	ref: AlluvialNodeRef | null | undefined,
): boolean {
	return !!ref && ref.kind !== 'bucket';
}

/**
 * Node click drill target: the node itself when it has a non-bucket ref.
 * Inspect mode never drills.
 */
export function drillTargetFromNode(
	name: string,
	mode: InteractionMode,
	refForName: (name: string) => AlluvialNodeRef | null,
): string | null {
	if (mode !== 'drill') return null;
	return isDrillableRef(refForName(name)) ? name : null;
}

/**
 * Line click drill target - same priority as host handleLineClick:
 * file target → package/unresolved/module source → package/unresolved/module
 * target → file source.
 *
 * Shared with hover cyan (DrillResolvers) so focus and click agree.
 */
export function drillTargetFromLine(
	sourceName: string | null,
	targetName: string | null,
	mode: InteractionMode,
	refForName: (name: string) => AlluvialNodeRef | null,
): string | null {
	if (mode !== 'drill') return null;

	const sourceRef = sourceName ? refForName(sourceName) : null;
	const targetRef = targetName ? refForName(targetName) : null;

	if (targetRef?.kind === 'file') return targetName;
	if (sourceRef?.kind === 'package' || sourceRef?.kind === 'unresolved') {
		return sourceName;
	}
	if (sourceRef?.kind === 'module') return sourceName;
	if (targetRef?.kind === 'package' || targetRef?.kind === 'unresolved') {
		return targetName;
	}
	if (targetRef?.kind === 'module') return targetName;
	if (sourceRef?.kind === 'file') return sourceName;
	return null;
}
