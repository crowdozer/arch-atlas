/**
 * Module-folder projection: package ends used by files under a topFolder.
 * Columns (L→R): Module → Ends (packages)
 *
 * Unit = one package/unresolved edge from a file in that folder.
 * Focus subject on the left (same convention as package drill-down).
 *
 * Display labels go through {@link claimName} so module folder vs package /
 * unresolved collisions never overwrite nodeRef or emit self-links.
 * Feed-omitted targets are excluded (catalog ends parity).
 */

import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
} from '@core/graph/types.ts';
import {
	buildAlluvialPayload,
	TEAL,
	topFolder,
	type BandSortMode,
	type WeightAxis,
} from '@core/view/alluvial.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
import { claimName } from '@core/view/hubLinkUtils.ts';
import {
	edgeWeight,
	pickEdgeWeightOpts,
	resolveWeightAxis,
	unitsForAxis,
	type LocPrecision,
} from '@core/view/weight.ts';

/**
 * Project package imports for files whose topFolder matches moduleFolder.
 * Returns null when the folder has no package/unresolved edges.
 */
export function projectModuleFocus(
	graph: CodeGraph,
	moduleFolder: string,
	opts?: {
		heightPx?: number;
		maxEnds?: number;
		weightAxis?: WeightAxis;
		precision?: LocPrecision;
		surface?: ImportedSurfaceProvider | null;
		/** In-column band stack order; default name. */
		bandSort?: BandSortMode;
	},
): AlluvialPayload | null {
	const heightPx = opts?.heightPx ?? 360;
	const maxEnds = opts?.maxEnds ?? 16;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const edgeWeightOpts = pickEdgeWeightOpts(opts);
	const units = unitsForAxis(weightAxis, 'package-mass', opts?.precision);

	// endKey → { preferredLabel, kind, mass } - kind is package | unresolved only
	const endCounts = new Map<
		string,
		{ label: string; kind: 'package' | 'unresolved'; n: number }
	>();

	for (const e of graph.edges) {
		// Architecture ends only - not file targets, not feed-omitted
		if (e.toKind === 'file' || e.toKind === 'omitted') continue;
		if (e.toKind !== 'package' && e.toKind !== 'unresolved') continue;
		if (topFolder(e.from) !== moduleFolder) continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const w = edgeWeight(e, graph, weightAxis, edgeWeightOpts);
		const prev = endCounts.get(e.to);
		if (prev) prev.n += w;
		else endCounts.set(e.to, { label, kind: e.toKind, n: w });
	}

	if (!endCounts.size) return null;

	// Focus claims its preferred name first so package ends cannot overwrite it
	const usedNames = new Set<string>();
	const focusLabel = claimName(usedNames, moduleFolder, 'module');
	const focus: AlluvialFocus = {
		kind: 'module',
		id: moduleFolder,
		label: focusLabel,
	};

	const ranked = [...endCounts.entries()].sort(
		(a, b) =>
			b[1].n - a[1].n || a[1].label.localeCompare(b[1].label),
	);
	const topKeys = new Set(ranked.slice(0, maxEnds).map(([k]) => k));
	const hasOther = ranked.some(([k]) => !topKeys.has(k));

	const linkMap = new Map<string, number>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[focusLabel]: { kind: 'module', id: moduleFolder },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(focusLabel, { category: 'Module', color: TEAL.module });

	// endKey → claimed display name (stable id remains endKey in nodeRef)
	const displayForEnd = new Map<string, string>();
	const otherLabel = hasOther
		? claimName(usedNames, '(other ends)', 'bucket')
		: '';

	for (const [endKey, info] of endCounts) {
		if (!topKeys.has(endKey)) continue;
		const suffix = info.kind === 'unresolved' ? 'unresolved' : 'package';
		const display = claimName(usedNames, info.label, suffix);
		displayForEnd.set(endKey, display);
		nodeRef[display] = {
			kind: info.kind,
			id: endKey,
		};
		const color =
			info.kind === 'unresolved'
				? TEAL.unresolved
				: graph.packages.get(endKey)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(display, { category: 'Ends', color });
	}
	if (hasOther && otherLabel) {
		nodeRef[otherLabel] = { kind: 'bucket', id: '(other ends)' };
		nodeMeta.set(otherLabel, { category: 'Ends', color: TEAL.other });
	}

	for (const [endKey, info] of endCounts) {
		const target = topKeys.has(endKey)
			? (displayForEnd.get(endKey) ?? info.label)
			: otherLabel;
		if (!target) continue;
		// Module (left) → Package end (right) - always distinct endpoints
		const k = `${focusLabel}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + info.n);
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	// Conserved: module outflow == sum of end inflows
	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['Module', 'Ends'],
		focus,
		nodeRef,
		units,
		ariaLabel: `Package ends for module ${moduleFolder}`,
		bandSort: opts?.bandSort,
		graph,
	});
}
