/**
 * Reverse package projection: who imports this package?
 * Columns (L→R): Importers → Package
 *
 * Graph-wide (not start-scoped). Unit = one observed edge into the package.
 */

import type {
	AlluvialFocus,
	AlluvialNodeRef,
	AlluvialPayload,
	CodeGraph,
	ImportEdge,
} from '@core/graph/types.ts';
import {
	basename,
	buildAlluvialPayload,
	TEAL,
	topFolder,
	uniqueFileLabels,
} from '@core/view/alluvial.ts';

const FILE_PROMOTE_THRESHOLD = 12;

/** True when edge targets the given package id or display label. */
export function edgeMatchesPackage(e: ImportEdge, packageIdOrLabel: string): boolean {
	if (e.toKind === 'file') return false;
	if (e.to === packageIdOrLabel) return true;
	const label =
		e.toKind === 'unresolved' ? e.specifier : e.to.replace(/^unresolved:/, '');
	return label === packageIdOrLabel;
}

function resolvePackageFocus(
	graph: CodeGraph,
	packageIdOrLabel: string,
	sampleEdge: ImportEdge | undefined,
): AlluvialFocus {
	const pkg = graph.packages.get(packageIdOrLabel);
	if (pkg) {
		return { kind: 'package', id: pkg.id, label: pkg.name };
	}
	if (sampleEdge) {
		const label =
			sampleEdge.toKind === 'unresolved'
				? sampleEdge.specifier
				: sampleEdge.to.replace(/^unresolved:/, '');
		const kind = sampleEdge.toKind === 'unresolved' ? 'unresolved' : 'package';
		return { kind, id: sampleEdge.to, label };
	}
	return {
		kind: 'package',
		id: packageIdOrLabel,
		label: packageIdOrLabel,
	};
}

/**
 * Project importers of a package/unresolved sink as an alluvial.
 * Returns null when no matching edges exist.
 */
export function projectPackageImporters(
	graph: CodeGraph,
	packageIdOrLabel: string,
	opts?: { heightPx?: number; maxImporters?: number },
): AlluvialPayload | null {
	const heightPx = opts?.heightPx ?? 360;
	const maxImporters = opts?.maxImporters ?? 16;

	const edges = graph.edges.filter((e) => edgeMatchesPackage(e, packageIdOrLabel));
	if (!edges.length) return null;

	const focus = resolvePackageFocus(graph, packageIdOrLabel, edges[0]);
	const packageLabel = focus.label;

	const importerPaths = [...new Set(edges.map((e) => e.from))];
	const useFiles = importerPaths.length <= FILE_PROMOTE_THRESHOLD;

	// importer display key → weight
	const weights = new Map<string, number>();
	// display key → nodeRef
	const importerRef = new Map<string, AlluvialNodeRef>();

	if (useFiles) {
		const labels = uniqueFileLabels(importerPaths);
		for (const e of edges) {
			const label = labels.get(e.from) ?? basename(e.from);
			weights.set(label, (weights.get(label) ?? 0) + 1);
			importerRef.set(label, { kind: 'file', id: e.from });
		}
	} else {
		for (const e of edges) {
			const mod = topFolder(e.from);
			weights.set(mod, (weights.get(mod) ?? 0) + 1);
			if (!importerRef.has(mod)) {
				importerRef.set(mod, { kind: 'module', id: mod });
			}
		}
	}

	// Bucket overflow importers
	const ranked = [...weights.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const kept = new Set(ranked.slice(0, maxImporters).map(([k]) => k));
	const hasOther = ranked.some(([k]) => !kept.has(k));

	const linkMap = new Map<string, number>();
	const nodeRef: Record<string, AlluvialNodeRef> = {
		[packageLabel]: { kind: focus.kind, id: focus.id },
	};
	const nodeMeta = new Map<string, { category: string; color: string }>();
	nodeMeta.set(packageLabel, {
		category: 'Package',
		color:
			focus.kind === 'unresolved'
				? TEAL.unresolved
				: graph.packages.get(focus.id)?.source === 'builtin'
					? TEAL.builtin
					: TEAL.package,
	});

	const otherLabel = '(other importers)';
	for (const [key, n] of weights) {
		const source = kept.has(key) ? key : otherLabel;
		const k = `${source}\0${packageLabel}`;
		linkMap.set(k, (linkMap.get(k) ?? 0) + n);

		if (source === otherLabel) continue;
		const ref = importerRef.get(key);
		if (ref) nodeRef[source] = ref;
		nodeMeta.set(source, {
			category: 'Importers',
			color: useFiles ? TEAL.start : TEAL.module,
		});
	}
	if (hasOther) {
		nodeRef[otherLabel] = { kind: 'bucket', id: otherLabel };
		nodeMeta.set(otherLabel, { category: 'Importers', color: TEAL.other });
	}

	const links = [...linkMap.entries()].map(([k, value]) => {
		const [source, target] = k.split('\0') as [string, string];
		return { source, target, value };
	});

	return buildAlluvialPayload({
		heightPx,
		links,
		nodeMeta,
		categoryOrder: ['Importers', 'Package'],
		focus,
		nodeRef,
		units: 'import edges',
		ariaLabel: `Importers of ${packageLabel}`,
	});
}
