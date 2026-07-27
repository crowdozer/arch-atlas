/**
 * Pixel height available for the alluvial inside the stage.
 * Caps to remaining viewport under the chart top so dense multi-hop
 * projections cannot paint below the fold.
 */
export function alluvialHeightPx(root: HTMLElement): number {
	const rect = root.getBoundingClientRect();
	const boxH = Math.floor(rect.height);
	// Space from chart top to viewport bottom (small bottom pad for OS chrome)
	const roomBelow = Math.floor(window.innerHeight - rect.top - 12);
	const capped = Math.min(
		boxH > 0 ? boxH : roomBelow,
		roomBelow > 0 ? roomBelow : boxH,
	);
	// Prefer measured stage; fall back if layout not settled yet
	const h = capped > 0 ? capped : Math.max(boxH, 360);
	return Math.max(240, h);
}
