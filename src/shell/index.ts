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
	isShakenWeightUi,
	parseInteractionMode,
	parseLocPrecision,
	parseSpineFormula,
	parseVizMaxDepth,
	parseWeightAxis,
} from '@shell/controls.ts';

export {
	SPINE_FORMULA_HONESTY_FOOTER,
	spineFormulaHelp,
	spineFormulaOptions,
} from '@shell/spineFormulaHelp.ts';
export type { SpineFormulaHelp } from '@shell/spineFormulaHelp.ts';

export type { InteractionMode, Session } from '@shell/types.ts';
