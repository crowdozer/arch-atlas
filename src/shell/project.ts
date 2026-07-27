/**
 * Pure payload projection for atlas views (wraps core projectors).
 */
import {
	projectFileHub,
	projectModuleFocus,
	projectPackageImporters,
	type AlluvialPayload,
	type CodeGraph,
	type WeightAxis,
} from '@core/index.ts';
import type { AtlasView } from '@shell/atlasView.ts';

export type PayloadProjectOpts = {
	weightAxis: WeightAxis;
	/** Viz-only dual BFS radius for file-hub; ignored by package/module. */
	maxDepth: number;
};

/** Project the current stack-top view against a graph. */
export function payloadForView(
	graph: CodeGraph,
	view: AtlasView,
	opts: PayloadProjectOpts,
): AlluvialPayload | null {
	const weightOpts = { weightAxis: opts.weightAxis };
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
