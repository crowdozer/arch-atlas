/**
 * Pure shell: navigation predicates, captions, projectors, control parsers.
 * No document / Carbon / chart imports.
 */
export type { AtlasView } from '@shell/atlasView.ts';
export {
	defaultDepthForView,
	nearestFileFocus,
	sameView,
	topOfStack,
	viewForFileOpen,
	viewUsesDepth,
} from '@shell/atlasView.ts';

export {
	captionForView,
	emptyPayloadStatus,
	statusForView,
} from '@shell/captions.ts';

export type { PayloadProjectOpts } from '@shell/project.ts';
export { payloadForView } from '@shell/project.ts';

export {
	canMountWeight,
	parseInteractionMode,
	parseLocPrecision,
	parseVizMaxDepth,
	parseWeightAxis,
} from '@shell/controls.ts';

export type { InteractionMode, Session } from '@shell/types.ts';
