/**
 * Node-side hub payload for focus e2e (same fixture as unit harness).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '@core/graph/build.ts';
import type { AlluvialPayload, VirtualFile } from '@core/graph/types.ts';
import { projectFileHub } from '@core/view/fileHub.ts';

const root = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../fixtures/codebreaker-focus',
);

function loadFixtureDir(dir: string, prefix = ''): VirtualFile[] {
	const out: VirtualFile[] = [];
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const rel = prefix ? `${prefix}/${name}` : name;
		if (statSync(full).isDirectory()) {
			if (name === 'node_modules' || name === '.next') continue;
			out.push(...loadFixtureDir(full, rel));
		} else if (/\.(ts|tsx|js|jsx|json|css|md)$/.test(name)) {
			const content = readFileSync(full, 'utf8');
			out.push({
				path: rel.replace(/\\/g, '/'),
				content,
				byteLength: content.length,
			});
		}
	}
	return out;
}

export const CODEBREAKER_PAGE = 'app/page.tsx';
export const CODEBREAKER_INDEX = 'app/components/codebreaker/index.tsx';
export const CODEBREAKER_HOOK = 'app/components/codebreaker/useCodebreaker.ts';
export const CODEBREAKER_BUFFER =
	'app/components/codebreaker/components/Buffer.tsx';
export const CODEBREAKER_FAQ =
	'app/components/codebreaker/components/FAQ.tsx';

export function buildCodebreakerPageHubPayload(): AlluvialPayload {
	const files = loadFixtureDir(root);
	const graph = buildGraph(files);
	const payload = projectFileHub(graph, CODEBREAKER_PAGE, {
		maxDepth: 3,
		maxImporters: 48,
		maxDeps: 48,
	});
	if (!payload) throw new Error('projectFileHub returned null for app/page.tsx');
	return payload;
}

/**
 * Playwright `page.evaluate` cannot clone functions (tooltip HTML, etc.).
 * Carbon accepts missing customHTML; chart still mounts for focus class dumps.
 */
export function toSerializablePayload(payload: AlluvialPayload): AlluvialPayload {
	return JSON.parse(
		JSON.stringify(payload, (_key, value) =>
			typeof value === 'function' ? undefined : value,
		),
	) as AlluvialPayload;
}
