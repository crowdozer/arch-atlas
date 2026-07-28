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
	BAND_SORT_MODES,
	LOC_PRECISIONS,
	canMountWeight,
	isShakenWeightUi,
	parseBandSortMode,
	parseInteractionMode,
	parseLocPrecision,
	parseSpineFormula,
	parseVizMaxDepth,
	parseWeightAxis,
	precisionForSurfaceClaims,
} from '@shell/controls.ts';
export type { BandSortMode } from '@shell/controls.ts';

export {
	SPINE_FORMULA_HONESTY_FOOTER,
	spineFormulaHelp,
	spineFormulaOptions,
} from '@shell/spineFormulaHelp.ts';
export type { SpineFormulaHelp } from '@shell/spineFormulaHelp.ts';

export type {
	InteractionMode,
	Session,
	SessionProgramMeta,
} from '@shell/types.ts';

export {
	familyFromLanguageTag,
	geometryForAxisKind,
	indication,
	languageChipStatus,
	lifecycle,
	statusColorCssVar,
} from '@shell/statusIndicator.ts';
export type {
	Geometry,
	LanguageChipFamily,
	LanguageChipStatusOpts,
	StatusAxis,
	StatusColorToken,
	StatusKind,
	StatusPresentation,
	StatusShape,
	StatusShapeVariant,
} from '@shell/statusIndicator.ts';
