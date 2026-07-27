/**
 * Spine formula help copy for the catalog info modal (pure strings, no DOM).
 */
import type { SpineFormula } from '@core/index.ts';
import { DEFAULT_SPINE_FORMULA } from '@core/index.ts';

export type SpineFormulaHelp = {
	id: SpineFormula;
	title: string;
	/** Short plain-language body for the modal. */
	body: string;
	/** Sort keys shown as a secondary line. */
	sortKeys: string;
};

const HELP: Record<SpineFormula, SpineFormulaHelp> = {
	'modules-then-in': {
		id: 'modules-then-in',
		title: 'Modules then fan-in',
		body:
			'Ranks files whose direct importers span the most distinct top-level folders first, then by how many files import them, then by multi-hop reverse reach. Answers: “Who is a cross-cutting dependency plane?” Soft floor: needs importers from at least two folders.',
		sortKeys: 'importerModuleCount → inDegree → reverseReachFiles',
	},
	'fan-in': {
		id: 'fan-in',
		title: 'Fan-in',
		body:
			'Ranks by direct importer count only (then module diversity as a tie-break). Answers: “Who has the most direct importers?” Includes single-folder hubs — no multi-module floor.',
		sortKeys: 'inDegree → importerModuleCount',
	},
	composite: {
		id: 'composite',
		title: 'Composite (breadth × diversity)',
		body:
			'Single product score: inDegree × importerModuleCount, then module count as tie-break. Answers: “Breadth and diversity in one number.” Soft floor: at least two importer folders.',
		sortKeys: 'composite → importerModuleCount',
	},
	share: {
		id: 'share',
		title: 'In-share',
		body:
			'Normalizes fan-in by project size: inDegree / source file count, then module diversity. Answers: “Who owns the largest share of import edges?” Soft floor: at least two importer folders.',
		sortKeys: 'inShare → importerModuleCount',
	},
};

export const SPINE_FORMULA_HONESTY_FOOTER =
	'Observed import graph + path folders. Not a language server. Not a “config” classifier. Not multi-hop blast radius alone.';

export function spineFormulaHelp(
	formula: SpineFormula = DEFAULT_SPINE_FORMULA,
): SpineFormulaHelp {
	return HELP[formula] ?? HELP[DEFAULT_SPINE_FORMULA];
}

export function spineFormulaOptions(): SpineFormulaHelp[] {
	return [
		HELP['modules-then-in'],
		HELP['fan-in'],
		HELP.composite,
		HELP.share,
	];
}
