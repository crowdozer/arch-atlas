/**
 * Display-only alluvial mass scale: layout channel for Carbon vs semantic mass.
 *
 * Projectors keep true integer mass. Stage feeds a scaled clone to d3-sankey so
 * extreme ratios stay readable; labels restore semantic numbers from the maps.
 * Does not rewrite hub residual / membership / Exact floors.
 */

import type { AlluvialLink, AlluvialPayload } from '@core/graph/types.ts';

export type DisplayMassScaleMode = 'identity' | 'sqrt' | 'log1p';

export type DisplayMassScaleOpts = {
	/** Monotone compress. Default: sqrt. Identity for opt-out tests. */
	mode?: DisplayMassScaleMode;
};

export type DisplayMassScaleResult = {
	/** Clone: data[].value + meta.externalStraightPairs[].width scaled. */
	layoutPayload: AlluvialPayload;
	/** linkKey "source\\0target" → original semantic value (pre-scale, aggregated). */
	semanticByLinkKey: Map<string, number>;
	/**
	 * Node display name → semantic incident mass.
	 * Carbon-like: max(inSum, outSum) per node name.
	 */
	semanticByNodeName: Map<string, number>;
};

/** Stable link identity for maps (matches polish / straighten pair identity). */
export function alluvialLinkKey(source: string, target: string): string {
	return source + '\0' + target;
}

function layoutMassFn(mode: DisplayMassScaleMode): (v: number) => number {
	switch (mode) {
		case 'identity':
			return (v) => v;
		case 'log1p':
			return (v) => Math.log1p(v);
		case 'sqrt':
		default:
			return (v) => Math.sqrt(v);
	}
}

/**
 * Map semantic payload → layout payload for Carbon thickness, plus honesty maps.
 * Does not mutate `payload`. Options object is shared by reference so functions
 * (e.g. tooltip customHTML) still work.
 */
export function scaleAlluvialDisplayMass(
	payload: AlluvialPayload,
	opts?: DisplayMassScaleOpts,
): DisplayMassScaleResult {
	const mode: DisplayMassScaleMode = opts?.mode ?? 'sqrt';
	const f = layoutMassFn(mode);

	const semanticByLinkKey = new Map<string, number>();
	const inSum = new Map<string, number>();
	const outSum = new Map<string, number>();

	for (const link of payload.data) {
		const key = alluvialLinkKey(link.source, link.target);
		semanticByLinkKey.set(
			key,
			(semanticByLinkKey.get(key) ?? 0) + link.value,
		);
		outSum.set(link.source, (outSum.get(link.source) ?? 0) + link.value);
		inSum.set(link.target, (inSum.get(link.target) ?? 0) + link.value);
	}

	const semanticByNodeName = new Map<string, number>();
	for (const name of new Set([...inSum.keys(), ...outSum.keys()])) {
		semanticByNodeName.set(
			name,
			Math.max(inSum.get(name) ?? 0, outSum.get(name) ?? 0),
		);
	}

	const layoutData: AlluvialLink[] = payload.data.map((link) => {
		const value =
			link.value > 0 ? f(link.value) : link.value;
		return {
			source: link.source,
			target: link.target,
			value,
		};
	});

	const pairs = payload.meta.externalStraightPairs;
	const layoutPairs = pairs
		? pairs.map((p) => ({
				parent: p.parent,
				packageName: p.packageName,
				width: p.width > 0 ? f(p.width) : p.width,
			}))
		: pairs;

	const layoutPayload: AlluvialPayload = {
		data: layoutData,
		// Reuse options by reference — clone would strip customHTML functions.
		options: payload.options,
		meta: {
			...payload.meta,
			...(layoutPairs !== undefined
				? { externalStraightPairs: layoutPairs }
				: {}),
		},
	};

	return { layoutPayload, semanticByLinkKey, semanticByNodeName };
}
