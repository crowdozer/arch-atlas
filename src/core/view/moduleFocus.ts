/**
 * Module-folder projection: package ends used by files under a topFolder.
 * Columns (L→R): Module → Ends (packages)
 *
 * Unit = one package/unresolved edge from a file in that folder.
 * Focus subject on the left (same convention as package drill-down).
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
	type WeightAxis,
} from '@core/view/alluvial.ts';
import type { ImportedSurfaceProvider } from '@core/view/importedSurface.ts';
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
	},
): AlluvialPayload | null {
	const heightPx = opts?.heightPx ?? 360;
	const maxEnds = opts?.maxEnds ?? 16;
	const weightAxis = resolveWeightAxis(opts?.weightAxis);
	const edgeWeightOpts = pickEdgeWeightOpts(opts);
	const units = unitsForAxis(weightAxis, 'package-mass', opts?.precision);

	// endKey → { label, kind, mass }
	const endCounts = new Map<string, { label: string; kind: string; n: number }>();

	for (const e of graph.edges) {
		if (e.toKind === 'file') continue;
		if (topFolder(e.from) !== moduleFolder) continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const w = edgeWeight(e, graph, weightAxis, edgeWeightOpts);
		const prev = endCounts.get(e.to);
		if (prev) prev.n += w;
		else endCounts.set(e.to, { label, kind: e.toKind, n: w });
	}

	if (!endCounts.size) return null;

	const focus: AlluvialFocus = {
		kind: 'module',
		id: moduleFolder,
		label: moduleFolder,
	};

	const ranked = [...endCounts.entries()].sort(
		(a, b) =>
			b[1].n - a[1].n || a[1].label.localeCompare(b[1].label),
	);
	const topKeys = new Set(ranked.slice(0, maxEnds).map(([k]) => k));
	const hasOther = ranked.some(([k]) => !topKeys.has(k));

	const linkMap = new Map<string, number>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[moduleFolder]: { kind: 'module', id: moduleFolder },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(moduleFolder, { category: 'Module', color: TEAL.module });

	const otherLabel = '(other ends)';
	for (const [endKey, info] of endCounts) {
		const target = topKeys.has(endKey) ? info.label : otherLabel;
		// Module (left) → Package end (right)
		const k = `${moduleFolder}\0${target}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + info.n);

		if (target === otherLabel) continue;
		nodeRef[target] = {
			kind: info.kind === 'unresolved' ? 'unresolved' : 'package',
			id: endKey,
		};
		const color =
			info.kind === 'unresolved'
				? TEAL.unresolved
				: info.kind === 'package' &&
					  graph.packages.get(endKey)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package;
		nodeMeta.set(target, { category: 'Ends', color });
	}
	if (hasOther) {
		nodeRef[otherLabel] = { kind: 'bucket', id: otherLabel };
		nodeMeta.set(otherLabel, { category: 'Ends', color: TEAL.other });
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
	});
}
