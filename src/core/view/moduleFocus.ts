/**
 * Module-folder projection: package ends used by files under a topFolder.
 * Columns (L→R): Ends → Module
 *
 * Unit = one package/unresolved edge from a file in that folder.
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
} from '@core/view/alluvial.ts';

/**
 * Project package imports for files whose topFolder matches moduleFolder.
 * Returns null when the folder has no package/unresolved edges.
 */
export function projectModuleFocus(
	graph: CodeGraph,
	moduleFolder: string,
	opts?: { heightPx?: number; maxEnds?: number },
): AlluvialPayload | null {
	const heightPx = opts?.heightPx ?? 360;
	const maxEnds = opts?.maxEnds ?? 16;

	// endKey → { label, kind, count }
	const endCounts = new Map<string, { label: string; kind: string; n: number }>();

	for (const e of graph.edges) {
		if (e.toKind === 'file') continue;
		if (topFolder(e.from) !== moduleFolder) continue;

		const label =
			e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
		const prev = endCounts.get(e.to);
		if (prev) prev.n += 1;
		else endCounts.set(e.to, { label, kind: e.toKind, n: 1 });
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
		const source = topKeys.has(endKey) ? info.label : otherLabel;
		const k = `${source}\0${moduleFolder}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + info.n);

		if (source === otherLabel) continue;
		nodeRef[source] = {
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
		nodeMeta.set(source, { category: 'Ends', color });
	}
	if (hasOther) {
		nodeRef[otherLabel] = { kind: 'bucket', id: otherLabel };
		nodeMeta.set(otherLabel, { category: 'Ends', color: TEAL.other });
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	// Total conserved: sum of end outflows == module inflow
	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['Ends', 'Module'],
		focus,
		nodeRef,
		units: 'package imports',
		ariaLabel: `Package ends for module ${moduleFolder}`,
	});
}
