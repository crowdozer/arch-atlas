/**
 * Pure payload projection for atlas views (wraps core projectors).
 */
import {
	projectFileHub,
	projectModuleFocus,
	projectPackageHub,
	type AlluvialPayload,
	type BandSortMode,
	type CodeGraph,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type WeightAxis,
} from '@core/index.ts';
import type { AtlasView } from '@shell/atlasView.ts';

export type PayloadProjectOpts = {
	weightAxis: WeightAxis;
	/** Viz-only dual BFS radius for file-hub / reverse radius for package-hub. */
	maxDepth: number;
	/** Imported-surface honesty; optional (defaults estimate inside projectors). */
	precision?: LocPrecision;
	/** Exact provider when precision is exact + target-loc. */
	surface?: ImportedSurfaceProvider | null;
	/** In-column band stack order; default name inside projectors. */
	bandSort?: BandSortMode;
};

/** Project the current stack-top view against a graph. */
export function payloadForView(
	graph: CodeGraph,
	view: AtlasView,
	opts: PayloadProjectOpts,
): AlluvialPayload | null {
	const weightOpts = {
		weightAxis: opts.weightAxis,
		precision: opts.precision,
		surface: opts.surface,
		bandSort: opts.bandSort,
	};
	switch (view.type) {
		case 'file-hub':
			return projectFileHub(graph, view.fileId, {
				...weightOpts,
				maxDepth: opts.maxDepth,
			});
		case 'package-hub':
			return projectPackageHub(graph, view.packageId, {
				...weightOpts,
				maxDepth: opts.maxDepth,
			});
		case 'module':
			return projectModuleFocus(graph, view.moduleId, weightOpts);
	}
}
