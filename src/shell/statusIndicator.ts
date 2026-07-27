/**
 * Carbon-style shape status presentation (shape + color + label).
 * Re-homed from Sentinel grammar — geometry only; no Sentinel domain mappers.
 *
 * ## Two axes (shape contract)
 *
 * - **lifecycle** — process / pipeline state
 *   (green circle done · half-circle progress · circle-slash fail · …).
 * - **indication** — content / severity
 *   (green triangle PASS · hollow yellow diamond WATCH · solid red square FAIL).
 *
 * Prefer `lifecycle()` / `indication()` over bare geometry.
 * Hollow yellow diamond for WATCH is locked: indication + cautious.
 * Do not use brand teal/emerald for PASS/FAIL.
 *
 * @see https://carbondesignsystem.com/patterns/status-indicator-pattern/
 */

import type { LocPrecision } from '@core/index.ts';

export type StatusKind =
	| 'stable'
	| 'incomplete'
	| 'informative'
	| 'draft'
	| 'cautious'
	| 'failed';

export type StatusAxis = 'lifecycle' | 'indication';

export type StatusShape =
	| 'circle'
	| 'circle-half'
	| 'circle-slash'
	| 'triangle'
	| 'diamond'
	| 'square';

export type StatusShapeVariant = 'solid' | 'outline';

/** Semantic color token (maps to --cds-status-*). Never brand teal for PASS/FAIL. */
export type StatusColorToken =
	| 'green'
	| 'red'
	| 'yellow'
	| 'blue'
	| 'gray'
	| 'purple';

export type StatusPresentation = {
	kind: StatusKind;
	axis: StatusAxis;
	shape: StatusShape;
	variant: StatusShapeVariant;
	color: StatusColorToken;
	label: string;
	title?: string;
};

export type Geometry = {
	shape: StatusShape;
	variant: StatusShapeVariant;
	color: StatusColorToken;
};

/**
 * Normative geometry: axis × kind.
 *
 * Lifecycle failed → circle-slash (process died).
 * Indication failed → solid square (content FAIL/risk).
 * Indication cautious → **outline yellow diamond** (hollow WATCH — locked).
 * Lifecycle cautious → outline yellow circle (not WATCH diamond).
 */
export function geometryForAxisKind(
	axis: StatusAxis,
	kind: StatusKind,
): Geometry {
	if (axis === 'lifecycle') {
		switch (kind) {
			case 'stable':
				// Process done / clear — solid green circle (not PASS triangle).
				return { shape: 'circle', variant: 'solid', color: 'green' };
			case 'incomplete':
				return { shape: 'circle-half', variant: 'solid', color: 'blue' };
			case 'informative':
				return { shape: 'circle', variant: 'solid', color: 'blue' };
			case 'draft':
				return { shape: 'circle', variant: 'outline', color: 'gray' };
			case 'cautious':
				// Process caution — circle, not WATCH diamond.
				return { shape: 'circle', variant: 'outline', color: 'yellow' };
			case 'failed':
				return { shape: 'circle-slash', variant: 'solid', color: 'red' };
		}
	}
	// indication
	switch (kind) {
		case 'stable':
			// Green up-triangle — PASS / content good.
			return { shape: 'triangle', variant: 'solid', color: 'green' };
		case 'incomplete':
			return { shape: 'circle-half', variant: 'solid', color: 'blue' };
		case 'informative':
			// Hollow blue triangle — content info.
			return { shape: 'triangle', variant: 'outline', color: 'blue' };
		case 'draft':
			return { shape: 'circle', variant: 'outline', color: 'gray' };
		case 'cautious':
			// ★ Hollow yellow diamond — WATCH / caution indication (locked).
			return { shape: 'diamond', variant: 'outline', color: 'yellow' };
		case 'failed':
			return { shape: 'square', variant: 'solid', color: 'red' };
	}
}

function present(
	axis: StatusAxis,
	kind: StatusKind,
	label: string,
	title?: string,
): StatusPresentation {
	const geometry = geometryForAxisKind(axis, kind);
	const p: StatusPresentation = {
		kind,
		axis,
		shape: geometry.shape,
		variant: geometry.variant,
		color: geometry.color,
		label,
	};
	if (title !== undefined) p.title = title;
	return p;
}

/** Lifecycle / process state — circle family (failed → circle-slash). */
export function lifecycle(
	kind: StatusKind,
	label: string,
	title?: string,
): StatusPresentation {
	return present('lifecycle', kind, label, title);
}

/**
 * Content / severity indication.
 * WATCH path: hollow yellow diamond; FAIL/risk: solid red square.
 */
export function indication(
	kind: StatusKind,
	label: string,
	title?: string,
): StatusPresentation {
	return present('indication', kind, label, title);
}

/** CSS custom property reference for a status color token. */
export function statusColorCssVar(color: StatusColorToken): string {
	return `var(--cds-status-${color})`;
}

/** Display language family for chip status (mirrors engine prefs families). */
export type LanguageChipFamily = 'js-ts' | 'python' | 'astro' | 'other';

export function familyFromLanguageTag(tag: string): LanguageChipFamily {
	const t = tag.trim().toLowerCase();
	if (t === 'typescript' || t === 'javascript') return 'js-ts';
	if (t === 'python') return 'python';
	if (t === 'astro') return 'astro';
	return 'other';
}

export type LanguageChipStatusOpts = {
	locPrecision: LocPrecision;
	/** Program worker in flight (lifecycle incomplete). */
	programLoading?: boolean;
	/** Last Exact/Program attempt failed and chrome fell back to Estimate. */
	engineFailed?: boolean;
};

/**
 * Map catalog language chip + session precision → status presentation.
 * Indication for capability/quality; lifecycle for in-flight Program load / done Program.
 */
export function languageChipStatus(
	displayLang: string,
	opts: LanguageChipStatusOpts,
): StatusPresentation {
	const family = familyFromLanguageTag(displayLang);
	const precision = opts.locPrecision;

	if (opts.engineFailed) {
		return indication(
			'failed',
			'Failed',
			'Engine failed · Estimate (not LSP)',
		);
	}

	if (family === 'js-ts') {
		if (opts.programLoading) {
			return lifecycle(
				'incomplete',
				'Loading',
				'Loading Program… (createProgram, not LSP)',
			);
		}
		if (precision === 'program') {
			return lifecycle(
				'stable',
				'Program',
				'Program (createProgram topology — not LSP)',
			);
		}
		if (precision === 'exact') {
			return indication(
				'stable',
				'Exact',
				'Exact (export-surface mass — not a language server)',
			);
		}
		// Estimate · Exact available for JS/TS
		return indication(
			'informative',
			'Estimate',
			'Estimate · Exact available (JS/TS export-surface)',
		);
	}

	if (family === 'python' || family === 'astro') {
		return indication(
			'cautious',
			'Estimate',
			`Estimate only (no Exact engine for ${displayLang})`,
		);
	}

	return indication(
		'draft',
		'Estimate',
		'Unsupported / Estimate (no Exact engine)',
	);
}
