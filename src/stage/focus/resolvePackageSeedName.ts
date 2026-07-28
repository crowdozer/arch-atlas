/**
 * Resolve sticky package FocusSeed display name from the **mounted** payload.
 *
 * Host open intent must key by stable package/unresolved id (not painted
 * file-hub labels). After package-hub remount, claimName decoration may differ
 * (`react · package` → `react`); seed name must match pairs / nodeRef on the
 * current chart or FocusPlan focuses zero bands.
 */
import type { AlluvialPayload } from '@core/graph/types.ts';

export type PackageFocusIntent = {
	/** Graph id: bare package name or `unresolved:…` / specifier id. */
	packageId: string;
	kind: 'package' | 'unresolved';
};

/**
 * Display name for `{ kind: 'package', name }` on the current payload, or null
 * if the package is not drawn (overflow-only / missing).
 */
export function resolvePackageSeedName(
	packageId: string,
	payload: Pick<AlluvialPayload, 'meta'> | null | undefined,
): string | null {
	if (!payload?.meta || !packageId) return null;
	const { nodeRef, focus, externalStraightPairs } = payload.meta;

	for (const [name, ref] of Object.entries(nodeRef ?? {})) {
		if (
			(ref.kind === 'package' || ref.kind === 'unresolved') &&
			ref.id === packageId
		) {
			return name;
		}
	}

	// Package-hub focus spine is the External sink
	if (
		(focus.kind === 'package' || focus.kind === 'unresolved') &&
		focus.id === packageId &&
		focus.label
	) {
		return focus.label;
	}

	// Pairs store painted packageName; accept when nodeRef maps that name to id
	for (const p of externalStraightPairs ?? []) {
		const ref = nodeRef?.[p.packageName];
		if (
			ref &&
			(ref.kind === 'package' || ref.kind === 'unresolved') &&
			ref.id === packageId
		) {
			return p.packageName;
		}
	}

	return null;
}
