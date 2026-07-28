/**
 * Carbon alluvial post-mount polish package.
 *
 * Public host surface: polishAlluvialHolder, isExternalStraightPairLink,
 * ExternalStraightPair. Test-facing pure helpers re-exported for the suite.
 */

export { polishAlluvialHolder } from './polish.ts';

export {
	stackBandsByNodeRank,
	stackBandsByNodeRankInHolder,
} from './bandOrder.ts';

export {
	isExternalStraightPairLink,
	planExternalStraightBands,
	straightenExternalPackageBands,
	type ExternalStraightPair,
	type ExternalStraightBandPlan,
} from './externalStraighten.ts';

export {
	centerHubFileSpine,
	centerHubFileSpineInHolder,
	isHubFileSpine,
} from './fileSpine.ts';

export {
	ALLUVIAL_LABEL_MAX_CHARS,
	buildAlluvialLabelStats,
	carbonAlluvialLabelTitleOffset,
	formatAlluvialLabelSuffix,
	formatAlluvialLocNumber,
	formatAlluvialMassNumber,
	rightTruncateAlluvialLabels,
	rightTruncateLabel,
	type AlluvialLabelStats,
	type LabelRewriteOpts,
} from './labels.ts';

export { hideAlluvialRails, isImportRailLabel } from './rails.ts';

export {
	markAlluvialExportTerminators,
	markAlluvialTerminators,
} from './terminators.ts';

export {
	highlightFileSpine,
	injectFileHeaderIcon,
	isExportSideCategory,
	isFileCategory,
	recolorExportBands,
} from './fileChrome.ts';

export {
	horizontalLinkPath,
	horizontalLinkRibbonPath,
	recomputeLinkBreadths,
	rewriteLinkRibbons,
} from './sankeyDom.ts';
export type { SankeyLink, SankeyNode } from './sankeyDom.ts';
