/**
 * Drawn-band inventory from payload (pair undraw + straighten).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import { listDrawnBandsFromPayload } from './displayInventory.ts';
import { externalBandKey, fileBandKey } from './logicalFocusGraph.ts';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../fixtures',
);

function walkFixtures(dir: string, base = dir): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walkFixtures(full, base));
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

describe('listDrawnBandsFromPayload', () => {
	it('main.tsx: carbon file bands + straighten pairs; no pair-covered External carbon', () => {
		const { graph } = indexFiles(
			walkFixtures(path.join(fixturesRoot, 'demo-react-simple')),
		);
		const payload = projectFileHub(graph, 'src/main.tsx', {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const inv = listDrawnBandsFromPayload(payload);
		const keys = new Set(inv.bands.map((b) => b.key));

		expect(keys.has(fileBandKey('src/main.tsx', 'src/App.tsx'))).toBe(true);
		expect(
			keys.has(fileBandKey('src/main.tsx', 'src/lib/logger.ts')),
		).toBe(true);
		// straighten for every pair
		for (const p of payload.meta.externalStraightPairs ?? []) {
			expect(
				keys.has(externalBandKey(p.parent, p.packageName)),
				`missing straighten ${p.parent}→${p.packageName}`,
			).toBe(true);
		}
		// pair-covered direct External attaches are not carbon drawn bands
		for (const p of payload.meta.externalStraightPairs ?? []) {
			const carbonKey = fileBandKey(p.parent, p.packageName);
			const band = inv.byKey.get(carbonKey);
			expect(band?.kind === 'carbon', `pair as carbon: ${carbonKey}`).toBe(
				false,
			);
		}
		// no rails
		for (const b of inv.bands) {
			expect(b.source.includes('rail')).toBe(false);
			expect(b.target.includes('rail')).toBe(false);
		}
	});
});
