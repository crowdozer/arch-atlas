/**
 * Assemble the map catalog from ranking bins (starts, ends, hotspots, …).
 */

import { catalogBlastRadius } from '@core/catalog/blastRadius.ts';
import { catalogComplex, catalogDeepest } from '@core/catalog/deepest.ts';
import { catalogEnds } from '@core/catalog/ends.ts';
import { catalogFileLoc } from '@core/catalog/fileLoc.ts';
import { catalogHotspots } from '@core/catalog/hotspots.ts';
import {
	DEFAULT_SPINE_FORMULA,
	catalogSpines,
} from '@core/catalog/spines.ts';
import { catalogStarts } from '@core/catalog/starts.ts';
import type { CodeGraph, MapCatalog, SpineFormula } from '@core/graph/types.ts';

/** Optional top-N overrides for catalog ranking bins (UI keeps defaults). */
export type BuildMapCatalogOpts = {
	/**
	 * Top-N for hotspots, complex, deepest, fileLoc, blastRadius, spines.
	 * Default 15 (UI). CLI digest typically passes a higher limit (e.g. 40).
	 */
	limit?: number;
	/** Starts list cap (default 40). */
	startsLimit?: number;
	/** Ends list cap (default 50). */
	endsLimit?: number;
	/** Spine ranking formula (default modules-then-in). */
	spineFormula?: SpineFormula;
};

function languageTags(graph: CodeGraph): string[] {
	const tags = new Set<string>();
	for (const f of graph.files.values()) {
		if (!f.isSource) continue;
		if (/\.tsx?$/i.test(f.path)) tags.add('TypeScript');
		else if (/\.jsx?$/i.test(f.path) || /\.mjs$/i.test(f.path) || /\.cjs$/i.test(f.path)) {
			tags.add('JavaScript');
		}
	}
	return [...tags].sort();
}

export function buildMapCatalog(graph: CodeGraph, opts?: BuildMapCatalogOpts): MapCatalog {
	const rankLimit = opts?.limit ?? 15;
	const startsLimit = opts?.startsLimit ?? 40;
	const endsLimit = opts?.endsLimit ?? 50;

	const spineFormula = opts?.spineFormula ?? DEFAULT_SPINE_FORMULA;
	const starts = catalogStarts(graph, startsLimit);
	const ends = catalogEnds(graph, endsLimit);
	const hotspots = catalogHotspots(graph, rankLimit);
	const complex = catalogComplex(graph, rankLimit);
	const deepest = catalogDeepest(graph, rankLimit);
	const fileLoc = catalogFileLoc(graph, rankLimit);
	const blastRadius = catalogBlastRadius(graph, rankLimit);
	const spines = catalogSpines(graph, rankLimit, spineFormula);
	// Exact overlay only — stable empty shape under estimate
	const publicMass: MapCatalog['publicMass'] = [];
	const icebergs: MapCatalog['icebergs'] = [];

	return {
		starts,
		ends,
		hotspots,
		complex,
		deepest,
		fileLoc,
		blastRadius,
		publicMass,
		icebergs,
		spines,
		spineFormula,
		summary: {
			sourceCount: graph.stats.sourceCount,
			packageCount: graph.stats.packageCount,
			edgeCount: graph.stats.edgeCount,
			unresolvedCount: graph.stats.unresolvedCount,
			languages: languageTags(graph),
		},
	};
}
