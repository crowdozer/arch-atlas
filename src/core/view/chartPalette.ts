/**
 * Chart / SVG hex palette — pure-core mirror of `carbon-theme.css` product tokens.
 *
 * Carbon Charts `color.scale` and SVG paint attrs need concrete colors (no CSS vars).
 * Hex values here are the single TS source of truth and **must match** the
 * `--atlas-*` / teal CDS interactive overrides in `src/styles/carbon-theme.css`.
 *
 * Family grammar (unchanged):
 * - Brand interactive: teal (not emerald)
 * - Import / left hops: cyan ladder
 * - Export / right bands: yellow ladder
 * - Active selection / File spine / package terminators: purple (`selectStrong`)
 */

/** Canonical chart palette (all scale / hop / spine / fallback roles). */
export const CHART_PALETTE = {
	/* Brand teal — match --cds-interactive / --cds-background-brand / button-primary */
	start: '#14b8a6', // teal-500 = --cds-interactive
	module: '#2dd4bf', // teal-400 = --cds-border-interactive / focus
	package: '#0d9488', // teal-600 = brand / ribbon fallback
	builtin: '#5eead4', // teal-300
	unresolved: '#f59e0b', // amber
	other: '#71717a', // zinc-500 = --cds-text-placeholder

	/** Export / outbound hub bands — yellow complements teal importers. */
	export: '#eab308', // yellow-500 = --atlas-export
	exportPkg: '#ca8a04', // yellow-600 = --atlas-export-pkg
	exportOther: '#a16207', // yellow-700 = --atlas-export-other

	/** Import cyan hop ladder (Imports / left) — closer to File is brighter. */
	importHopFar: '#0e7490', // cyan-700
	importHopMidFar: '#0891b2', // cyan-600
	importHopMid: '#06b6d4', // cyan-500
	importHopNear: '#22d3ee', // cyan-400 = --atlas-drill-strong

	/** Multi-hop teal ladder (depth stages). */
	hopFar: '#0f766e', // teal-700 = --cds-button-primary-active
	hopMidFar: '#0d9488', // teal-600
	hopMid: '#14b8a6', // teal-500
	hopNear: '#2dd4bf', // teal-400

	/** Export free-source cyan (reverse importers on Exports column). */
	exportFree: '#06b6d4', // cyan-500
	exportFreeOther: '#0e7490', // cyan-700

	/** Purple selection — match --atlas-select-strong / File spine. */
	selectStrong: '#a78bfa',

	/** Default ribbon / link stroke when no node color is available. */
	brand: '#0d9488', // teal-600
} as const;

export type ChartPalette = typeof CHART_PALETTE;

/**
 * Alluvial scale keys historically named `TEAL` (includes yellow export bands).
 * Prefer `CHART_PALETTE` for new call sites; re-exported for minimal churn.
 */
export const TEAL = {
	start: CHART_PALETTE.start,
	module: CHART_PALETTE.module,
	package: CHART_PALETTE.package,
	builtin: CHART_PALETTE.builtin,
	unresolved: CHART_PALETTE.unresolved,
	other: CHART_PALETTE.other,
	export: CHART_PALETTE.export,
	exportPkg: CHART_PALETTE.exportPkg,
	exportOther: CHART_PALETTE.exportOther,
} as const;
