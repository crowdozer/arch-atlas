/**
 * Inferred end / sink catalog: packages, builtins, unresolved bare imports.
 * Omitted feed targets are not ranked as architecture ends.
 */

import type { CatalogEnd, CodeGraph } from '@core/graph/types.ts';

export function catalogEnds(graph: CodeGraph, limit = 50): CatalogEnd[] {
	const inDeg = new Map<string, number>();

	for (const e of graph.edges) {
		// Do not treat omitted as unresolved architecture ends
		if (e.toKind === 'package' || e.toKind === 'unresolved') {
			inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
		}
	}

	const ends: CatalogEnd[] = [];

	for (const [id, pkg] of graph.packages) {
		const deg = inDeg.get(id) ?? 0;
		ends.push({
			id,
			label: pkg.name,
			kind: pkg.source === 'builtin' ? 'builtin' : 'package',
			inDegree: deg,
			epistemic: pkg.epistemic,
		});
	}

	for (const [to, deg] of inDeg) {
		if (to.startsWith('unresolved:')) {
			ends.push({
				id: to,
				label: to.replace(/^unresolved:/, ''),
				kind: 'unresolved',
				inDegree: deg,
				epistemic: 'observed',
			});
		}
	}

	// packages with 0 imports still listed (declared in package.json)
	ends.sort((a, b) => b.inDegree - a.inDegree || a.label.localeCompare(b.label));
	return ends.slice(0, limit);
}
