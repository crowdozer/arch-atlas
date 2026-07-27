/**
 * Multi-signal godfile candidates for the map catalog.
 *
 * Concentration of responsibility: edge mass (both directions, Laplace-smoothed),
 * path-prefix domain span, and whole-file size — not single-axis busy-ness alone
 * and not dual-axis-only (composition roots / long client controllers must rank).
 */

import type { CatalogGodfile, CodeGraph } from '@core/graph/types.ts';
import { topFolder } from '@core/view/alluvial.ts';
import { fileLineCount } from '@core/view/weight.ts';

/**
 * Source files that look like architectural concentration points.
 *
 * Scoring defaults (reversible):
 * - Eligible when (inDegree + outDegree) ≥ 1 and loc ≥ 1
 * - domainsTouched = unique topFolder over self ∪ 1-hop file neighbors
 *   (imports + importers; folder domains, not business domains)
 * - score = (in+1) * (out+1) * max(1, domainsTouched) * max(1, loc)
 *   Laplace +1 keeps high-out / low-in composition roots in play; LOC
 *   surfaces long god-controllers (e.g. pre-refactor app.ts)
 * - packageOut is meta only (avoids pure barrel false tops without size)
 * - Sort score desc, then edge mass (in+out), then loc, then path; limit 15
 * - epistemic: inferred (the ranking/candidacy claim)
 */
export function catalogGodfiles(graph: CodeGraph, limit = 15): CatalogGodfile[] {
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	const packageOut = new Map<string, number>();
	/** file → imported files */
	const imports = new Map<string, string[]>();
	/** file → importers */
	const importers = new Map<string, string[]>();

	for (const e of graph.edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		if (e.toKind === 'package' || e.toKind === 'unresolved') {
			packageOut.set(e.from, (packageOut.get(e.from) ?? 0) + 1);
		}
		if (e.toKind === 'file') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
			const outs = imports.get(e.from) ?? [];
			outs.push(e.to);
			imports.set(e.from, outs);
			const ins = importers.get(e.to) ?? [];
			ins.push(e.from);
			importers.set(e.to, ins);
		}
	}

	const rows: CatalogGodfile[] = [];
	for (const [path, node] of graph.files) {
		if (!node.isSource) continue;
		const out = outDeg.get(path) ?? 0;
		const inn = inDeg.get(path) ?? 0;
		if (inn + out < 1) continue;

		const loc = fileLineCount(graph, path);
		if (loc < 1) continue;

		const domains = new Set<string>();
		domains.add(topFolder(path));
		for (const n of imports.get(path) ?? []) domains.add(topFolder(n));
		for (const n of importers.get(path) ?? []) domains.add(topFolder(n));
		const domainsTouched = domains.size;
		const score =
			(inn + 1) * (out + 1) * Math.max(1, domainsTouched) * Math.max(1, loc);

		rows.push({
			id: path,
			path,
			score,
			inDegree: inn,
			outDegree: out,
			loc,
			packageOut: packageOut.get(path) ?? 0,
			domainsTouched,
			epistemic: 'inferred',
		});
	}

	rows.sort(
		(a, b) =>
			b.score - a.score ||
			b.inDegree + b.outDegree - (a.inDegree + a.outDegree) ||
			b.loc - a.loc ||
			a.path.localeCompare(b.path),
	);
	return rows.slice(0, limit);
}
