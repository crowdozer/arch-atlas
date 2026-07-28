/**
 * Ordered post-mount polish facade for Carbon alluvial holders.
 *
 * Pipeline (exact order — do not reorder):
 * **band order by nodeRank** → center spine → **link ribbons** → truncate labels
 * → hide rails with pairs → straighten → terminators → File chrome → export
 * recolor → svg overflow
 */

import { stackBandsByNodeRankInHolder } from './bandOrder.ts';
import { straightenExternalPackageBands } from './externalStraighten.ts';
import type { ExternalStraightPair } from './externalStraighten.ts';
import {
	highlightFileSpine,
	recolorExportBands,
} from './fileChrome.ts';
import { centerHubFileSpineInHolder } from './fileSpine.ts';
import {
	ALLUVIAL_LABEL_MAX_CHARS,
	rightTruncateAlluvialLabels,
	type LabelRewriteOpts,
} from './labels.ts';
import { hideAlluvialRails } from './rails.ts';
import { rewriteLinkRibbons } from './sankeyDom.ts';
import {
	markAlluvialExportTerminators,
	markAlluvialTerminators,
} from './terminators.ts';

/**
 * Center hub File spine, rewrite bands as filled ribbons, highlight File column,
 * right-truncate labels, recolor exports.
 * Hides pad rails / pad bands; marks hub terminators from meta.
 */
export function polishAlluvialHolder(
	holder: HTMLElement,
	opts?: {
		colorScale?: Record<string, string>;
		/** Default true — center File when it has both import and export edges. */
		centerHubFile?: boolean;
		/** Max chars for node name (default {@link ALLUVIAL_LABEL_MAX_CHARS}). */
		labelMaxChars?: number;
		/**
		 * Payload in-column ranks (`meta.nodeRank`). Restacks peers after Carbon
		 * crossing reduction so Band order (name/mass) matches the chart.
		 */
		nodeRank?: Record<string, number>;
		/** Rewrite Carbon `(value)` → `(↑|↓flow, loc)`. */
		labelRewrite?: LabelRewriteOpts;
		/**
		 * Reverse free-source pad targets (Exports* left) → cyan wrap.
		 * @see markAlluvialTerminators
		 */
		terminators?: readonly string[];
		/**
		 * Forward true leaves (Imports / External, right) → yellow wrap.
		 * @see markAlluvialExportTerminators
		 */
		exportTerminators?: readonly string[];
		/**
		 * Construction-time External parent→package pairs (hub meta).
		 * @see straightenExternalPackageBands / planExternalStraightBands
		 */
		externalStraightPairs?: readonly ExternalStraightPair[];
	},
): void {
	// Before spine center: lock column Y to payload order (Carbon otherwise
	// reshuffles for crossing reduction and defeats Band order).
	stackBandsByNodeRankInHolder(holder, opts?.nodeRank);
	centerHubFileSpineInHolder(holder, { centerHubFile: opts?.centerHubFile });
	// Always ribbon-ize Carbon path.link (not only when File moved) — mass in fill
	rewriteLinkRibbons(holder);
	rightTruncateAlluvialLabels(
		holder,
		opts?.labelMaxChars ?? ALLUVIAL_LABEL_MAX_CHARS,
		opts?.labelRewrite,
	);
	// Undraw scaffolds + any pair-covered parent→package (incl. direct deepest attaches)
	hideAlluvialRails(holder, { pairs: opts?.externalStraightPairs });
	// Then paint one straight parent→package band per construction pair (also ribbons)
	straightenExternalPackageBands(holder, {
		pairs: opts?.externalStraightPairs,
	});
	// Contrast: cyan on yellow Exports free sources; yellow on cyan Imports leaves
	markAlluvialTerminators(holder, opts?.terminators);
	markAlluvialExportTerminators(holder, opts?.exportTerminators);
	highlightFileSpine(holder);
	if (opts?.colorScale) recolorExportBands(holder, opts.colorScale);
	const svg = holder.querySelector('svg');
	if (svg) svg.style.overflow = 'visible';
}
