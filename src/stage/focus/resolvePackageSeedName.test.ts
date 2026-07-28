/**
 * Phase 2B: sticky package seed resolves painted file-hub labels to package-hub names.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import { projectPackageHub } from '@core/view/packageHub.ts';
import {
	buildLogicalFocusGraph,
	planFocus,
} from './logicalFocusGraph.ts';
import { resolvePackageSeedName } from './resolvePackageSeedName.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function walk(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full, base));
		else {
			const rel = path.relative(base, full).split(path.sep).join('/');
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel,
				content,
				byteLength: Buffer.byteLength(content),
			});
		}
	}
	return out;
}

describe('resolvePackageSeedName', () => {
	it('sticky-package scene: painted file-hub label ≠ package-hub label; id resolves', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'scene-sticky-package')),
		);
		const fileHub = projectFileHub(graph, 'app.ts', {
			maxDepth: 1,
			weightAxis: 'import-edges',
		})!;
		const painted = Object.entries(fileHub.meta.nodeRef).find(
			([, r]) => r.kind === 'package' && r.id === 'react',
		)?.[0];
		expect(painted).toBe('react · package');

		const pkgHub = projectPackageHub(graph, 'react', {
			maxDepth: 2,
			weightAxis: 'import-edges',
		})!;
		// Package hub uses raw package label
		expect(pkgHub.meta.nodeRef['react']?.id).toBe('react');

		// Wrong: seed with painted file-hub name
		const bad = planFocus(buildLogicalFocusGraph(pkgHub), {
			kind: 'package',
			name: painted!,
		});
		expect(bad.focusedBandKeys.size).toBe(0);

		// Right: resolve from mounted payload by stable id
		const resolved = resolvePackageSeedName('react', pkgHub);
		expect(resolved).toBe('react');
		const good = planFocus(buildLogicalFocusGraph(pkgHub), {
			kind: 'package',
			name: resolved!,
		});
		expect(good.focusedBandKeys.size).toBeGreaterThan(0);
		expect(good.activeLabels.has('react')).toBe(true);
		// At least one pair parent participates
		const parents = (pkgHub.meta.externalStraightPairs ?? [])
			.filter((p) => p.packageName === resolved)
			.map((p) => p.parent);
		expect(parents.length).toBeGreaterThan(0);
		for (const parent of parents) {
			expect(
				[...good.focusedBandKeys].some(
					(k) => k.includes(parent) || good.activeLabels.has(parent),
				),
			).toBe(true);
		}
	});

	it('returns null when package is absent from payload', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'scene-sticky-package')),
		);
		const pkgHub = projectPackageHub(graph, 'react')!;
		expect(resolvePackageSeedName('definitely-missing-xyz', pkgHub)).toBeNull();
	});

	it('ordinary package (no collision) resolves to own name', () => {
		const { graph } = indexFiles(
			walk(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const pkgHub = projectPackageHub(graph, 'nodemailer', {
			weightAxis: 'import-edges',
		})!;
		expect(resolvePackageSeedName('nodemailer', pkgHub)).toBe('nodemailer');
		const plan = planFocus(buildLogicalFocusGraph(pkgHub), {
			kind: 'package',
			name: 'nodemailer',
		});
		expect(plan.focusedBandKeys.size).toBeGreaterThan(0);
	});
});
