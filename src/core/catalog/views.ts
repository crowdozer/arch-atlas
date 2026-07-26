/**
 * Suggested map-catalog views from graph + starts.
 */

import { catalogEnds } from '@core/catalog/ends.ts';
import { catalogHotspots } from '@core/catalog/hotspots.ts';
import { catalogStarts } from '@core/catalog/starts.ts';
import type { CodeGraph, MapCatalog, SuggestedView } from '@core/graph/types.ts';

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

export function buildMapCatalog(graph: CodeGraph): MapCatalog {
	const starts = catalogStarts(graph);
	const ends = catalogEnds(graph);
	const hotspots = catalogHotspots(graph);
	const views: SuggestedView[] = [];

	const primary = starts[0];
	if (primary) {
		views.push({
			id: `import-surface:${primary.id}`,
			title: `Import surface · ${basename(primary.path)}`,
			description:
				'Start file → intermediate modules (folder clusters) → packages and sinks',
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

	// High-edge hotspots as suggested entry points (skip already listed starts)
	const listed = new Set(views.map((v) => v.startId));
	for (const h of hotspots.slice(0, 5)) {
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
		if (views.length >= 8) break;
	}

	return {
		starts,
		ends,
		hotspots,
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
