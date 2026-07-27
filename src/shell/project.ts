/**
 * Pure payload projection for atlas views (wraps core projectors).
 */
import {
	projectFileHub,
	projectModuleFocus,
	projectPackageImporters,
	type AlluvialPayload,
	type CodeGraph,
	type ImportedSurfaceProvider,
	type LocPrecision,
	type WeightAxis,
} from '@core/index.ts';
import type { AtlasView } from '@shell/atlasView.ts';

export type PayloadProjectOpts = {
	weightAxis: WeightAxis;
	/** Viz-only dual BFS radius for file-hub; ignored by package/module. */
	maxDepth: number;
	/** Imported-surface honesty; optional (defaults estimate inside projectors). */
	precision?: LocPrecision;
	/** Exact provider when precision is exact + target-loc. */
	surface?: ImportedSurfaceProvider | null;
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
	};
	switch (view.type) {
		case 'file-hub':
			return projectFileHub(graph, view.fileId, {
				...weightOpts,
				maxDepth: opts.maxDepth,
			});
		case 'package':
			return projectPackageImporters(graph, view.packageId, weightOpts);
		case 'module':
			return projectModuleFocus(graph, view.moduleId, weightOpts);
	}
}
