/**
 * Aggressive AlluvialPayload integrity oracle (test / czar gate).
 *
 * Test-owned: projectors do not call this at runtime. One shared surface for
 * file-hub, package-hub, module-focus, and catalog smoke - do not fork
 * projector-named copies.
 *
 * Structure-hard checks only (unique names, endpoints, values, coverage).
 * Topology membership (scarce fan-out, cyclic depth) is Phase 1+; do not fold
 * those into this helper.
 */
import { expect } from 'vitest';
import type { AlluvialPayload } from '@core/graph/types.ts';
import { isAlluvialRailName } from '@core/view/alluvial.ts';

/** Minimal focus-graph shape for rail-exclusion checks (no stage import). */
export type FocusGraphRailView = {
	fileNodes: Iterable<string>;
	packageNodes: Iterable<string>;
};

/**
 * Collect integrity issues for a payload. Empty array = structurally valid.
 * Prefer {@link assertAlluvialPayloadIntegrity} in tests.
 */
export function collectAlluvialPayloadIntegrityIssues(
	payload: AlluvialPayload,
): string[] {
	const issues: string[] = [];
	const nodes = payload.options?.alluvial?.nodes ?? [];
	const data = payload.data ?? [];
	const nodeRef = payload.meta?.nodeRef ?? {};
	const nodeRank = payload.meta?.nodeRank ?? {};
	const scale = payload.options?.color?.scale ?? {};
	const pairs = payload.meta?.externalStraightPairs ?? [];
	const focus = payload.meta?.focus;

	// -- unique node names ------------------------------------------------
	const nameCounts = new Map<string, number>();
	for (const n of nodes) {
		nameCounts.set(n.name, (nameCounts.get(n.name) ?? 0) + 1);
	}
	for (const [name, count] of nameCounts) {
		if (count > 1) {
			issues.push(`duplicate node name "${name}" (×${count})`);
		}
	}

	const nameSet = new Set(nameCounts.keys());

	// -- visible category + rank + color + nodeRef coverage --------------
	for (const n of nodes) {
		if (!n.name) {
			issues.push('empty node name');
			continue;
		}
		if (typeof n.category !== 'string' || !n.category) {
			issues.push(`node "${n.name}" missing category`);
		}
		if (nodeRank[n.name] === undefined) {
			issues.push(`node "${n.name}" missing nodeRank`);
		}
		if (scale[n.name] == null || scale[n.name] === '') {
			issues.push(`node "${n.name}" missing color.scale`);
		}
		const ref = nodeRef[n.name];
		if (!ref) {
			issues.push(`node "${n.name}" missing nodeRef`);
		} else if (!ref.kind || ref.id === undefined || ref.id === '') {
			issues.push(`node "${n.name}" nodeRef incomplete`);
		}
	}

	// -- link endpoints, self-links, values ------------------------------
	for (const l of data) {
		const { source, target, value } = l;
		if (source === target) {
			issues.push(`self-link ${source}→${target}`);
		}
		if (!Number.isFinite(value) || !(value > 0)) {
			issues.push(
				`non-positive/non-finite link ${source}→${target} value=${String(value)}`,
			);
		}
		if (!nameSet.has(source)) {
			issues.push(`link source "${source}" not in nodes`);
		}
		if (!nameSet.has(target)) {
			issues.push(`link target "${target}" not in nodes`);
		}
		// Exactly one node per endpoint name (already enforced by unique names + membership)
	}

	// -- focus label resolves --------------------------------------------
	if (!focus || typeof focus.label !== 'string' || !focus.label) {
		issues.push('meta.focus.label missing');
	} else if (!nameSet.has(focus.label)) {
		issues.push(`meta.focus.label "${focus.label}" not in nodes`);
	} else if (isAlluvialRailName(focus.label)) {
		issues.push(`meta.focus.label is a rail "${focus.label}"`);
	}

	// -- externalStraightPairs resolve + positive widths ----------------
	for (const p of pairs) {
		if (!p.parent || !p.packageName) {
			issues.push('externalStraightPair missing parent or packageName');
			continue;
		}
		if (!nameSet.has(p.parent)) {
			issues.push(`pair parent "${p.parent}" not in nodes`);
		}
		if (!nameSet.has(p.packageName)) {
			issues.push(`pair packageName "${p.packageName}" not in nodes`);
		}
		if (!Number.isFinite(p.width) || !(p.width > 0)) {
			issues.push(
				`pair ${p.parent}→${p.packageName} non-positive width=${String(p.width)}`,
			);
		}
		if (isAlluvialRailName(p.parent) || isAlluvialRailName(p.packageName)) {
			issues.push(
				`pair uses rail endpoint ${p.parent}→${p.packageName}`,
			);
		}
	}

	// -- rails: bucket-only in nodeRef; not seedable package/file ids ----
	for (const n of nodes) {
		if (!isAlluvialRailName(n.name)) continue;
		const ref = nodeRef[n.name];
		if (ref && ref.kind !== 'bucket') {
			issues.push(
				`rail "${n.name}" nodeRef.kind=${ref.kind} (expected bucket)`,
			);
		}
	}

	return issues;
}

/**
 * Rails must not appear as file/package members of a LogicalFocusGraph.
 * Pass the built graph from stage tests (core stays free of stage imports).
 */
export function collectFocusGraphRailIssues(
	graph: FocusGraphRailView,
): string[] {
	const issues: string[] = [];
	for (const n of graph.fileNodes) {
		if (isAlluvialRailName(n)) {
			issues.push(`LogicalFocusGraph.fileNodes contains rail "${n}"`);
		}
	}
	for (const n of graph.packageNodes) {
		if (isAlluvialRailName(n)) {
			issues.push(`LogicalFocusGraph.packageNodes contains rail "${n}"`);
		}
	}
	return issues;
}

/** Vitest assert: payload is structurally valid. */
export function assertAlluvialPayloadIntegrity(
	payload: AlluvialPayload,
	label: string,
): void {
	const issues = collectAlluvialPayloadIntegrityIssues(payload);
	expect(issues, `${label}: payload integrity`).toEqual([]);
}

/** Vitest assert: focus graph has no rail members. */
export function assertFocusGraphNoRails(
	graph: FocusGraphRailView,
	label: string,
): void {
	const issues = collectFocusGraphRailIssues(graph);
	expect(issues, `${label}: focus rails`).toEqual([]);
}
