/**
 * Suggested map-catalog views from graph + starts.
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
import type {
	CodeGraph,
	MapCatalog,
	SpineFormula,
	SuggestedView,
} from '@core/graph/types.ts';

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
	const views: SuggestedView[] = [];

	const primary = starts[0];
	if (primary) {
		views.push({
			id: `import-surface:${primary.id}`,
			title: `Import surface · ${basename(primary.path)}`,
			description:
				'Imports (packages) → Hop · file leaves → File (import surface)',
			startId: primary.id,
			edgeCount: primary.outDegree + primary.inDegree,
			epistemic: 'inferred',
		});
	}

	// extra views for top alternate starts (distinct)
	for (const s of starts.slice(1, 4)) {
		views.push({
			id: `import-surface:${s.id}`,
			title: `Import surface · ${basename(s.path)}`,
			description: `Alternate start (${s.reason})`,
			startId: s.id,
			edgeCount: s.outDegree + s.inDegree,
			epistemic: 'inferred',
		});
	}

	// Suggested shortcuts: complexity first, then high-edges, then depth,
	// then blast radius
	const listed = new Set(views.map((v) => v.startId));
	for (const c of complex.slice(0, 3)) {
		if (listed.has(c.id)) continue;
		views.push({
			id: `tree-complex:${c.id}`,
			title: `Tree complexity · ${basename(c.path)}`,
			description: `${c.downwindEdges} downwind edges · ${c.packageEnds} pkgs · ${c.maxHops} hops`,
			startId: c.id,
			edgeCount: c.downwindEdges,
			epistemic: 'observed',
		});
		listed.add(c.id);
	}
	for (const h of hotspots.slice(0, 3)) {
		if (listed.has(h.id)) continue;
		views.push({
			id: `high-edges:${h.id}`,
			title: `High edges · ${basename(h.path)}`,
			description: `${h.edgeCount} edges · out ${h.outDegree} · in ${h.inDegree}`,
			startId: h.id,
			edgeCount: h.edgeCount,
			epistemic: 'observed',
		});
		listed.add(h.id);
	}
	for (const d of deepest.slice(0, 3)) {
		if (listed.has(d.id)) continue;
		views.push({
			id: `tree-depth:${d.id}`,
			title: `Tree depth · ${basename(d.path)}`,
			description: `${d.maxHops} hops · ${d.reachableFiles} files · ${d.packageEnds} pkgs`,
			startId: d.id,
			edgeCount: d.edgeCount,
			epistemic: 'observed',
		});
		listed.add(d.id);
	}
	for (const b of blastRadius.slice(0, 2)) {
		if (listed.has(b.id)) continue;
		views.push({
			id: `blast:${b.id}`,
			title: `Blast radius · ${basename(b.path)}`,
			description: `${b.reverseReachFiles} reverse consumers · ${b.reverseMaxHops} hops`,
			startId: b.id,
			edgeCount: b.reverseReachFiles,
			epistemic: 'observed',
		});
		listed.add(b.id);
	}

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
		views,
		summary: {
			sourceCount: graph.stats.sourceCount,
			packageCount: graph.stats.packageCount,
			edgeCount: graph.stats.edgeCount,
			unresolvedCount: graph.stats.unresolvedCount,
			languages: languageTags(graph),
		},
	};
}

function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i >= 0 ? path.slice(i + 1) : path;
}
