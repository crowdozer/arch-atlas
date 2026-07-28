/**
 * Dual-host alluvial stage: Carbon mount, polish, focus, click bind.
 * Web host (and future webview) injects callbacks; stage owns chart + payload.
 */

export {
	createAlluvialStage,
	type AlluvialStage,
	type AlluvialStageHost,
} from './mount.ts';

export { alluvialHeightPx } from './height.ts';

export {
	datumName,
	linkEndpointName,
	bindAlluvialRenderPolish,
	bindAlluvialClicks,
	type AlluvialClickHandlers,
} from './carbonEvents.ts';

export {
	isDrillableRef,
	drillTargetFromNode,
	drillTargetFromLine,
} from './drill.ts';

export {
	createHubAlluvialFocus,
	bindHubAlluvialFocusEvents,
	type AlluvialFocusApi,
	type DrillResolvers,
} from './focus/bindAlluvialFocus.ts';

export { polishAlluvialHolder } from './polish/index.ts';

export {
	dumpCarbonRender,
	type CarbonRenderDump,
	type CarbonNodeDump,
	type CarbonLinkDump,
} from './debugCarbonDump.ts';
