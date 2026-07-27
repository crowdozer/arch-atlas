/**
 * Multi-signal godfile candidates for the map catalog.
 *
 * Not “large file” or single-axis busy-ness: requires both fan-in and fan-out,
 * then ranks by in * out * path-prefix domain span (inferred candidacy).
 */

import type { CatalogGodfile, CodeGraph } from '@core/graph/types.ts';
import { topFolder } from '@core/view/alluvial.ts';

/**
 * Source files that look like architectural concentration points.
 *
 * Scoring defaults (reversible):
 * - Eligible only when inDegree ≥ 1 AND outDegree ≥ 1
 * - domainsTouched = unique topFolder over self ∪ 1-hop file neighbors
 *   (imports + importers; folder domains, not business domains)
 * - score = inDegree * outDegree * max(1, domainsTouched)
 * - packageOut is meta only (avoids pure barrel false tops)
 * - Sort score desc, then edge mass (in+out), then path; limit 15
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
		if (inn < 1 || out < 1) continue;

		const domains = new Set<string>();
		domains.add(topFolder(path));
		for (const n of imports.get(path) ?? []) domains.add(topFolder(n));
		for (const n of importers.get(path) ?? []) domains.add(topFolder(n));
		const domainsTouched = domains.size;
		const score = inn * out * Math.max(1, domainsTouched);

		rows.push({
			id: path,
			path,
			score,
			inDegree: inn,
			outDegree: out,
			packageOut: packageOut.get(path) ?? 0,
			domainsTouched,
			epistemic: 'inferred',
		});
	}

	rows.sort(
		(a, b) =>
			b.score - a.score ||
			b.inDegree + b.outDegree - (a.inDegree + a.outDegree) ||
			a.path.localeCompare(b.path),
	);
	return rows.slice(0, limit);
}
