/**
 * Golden hub orientation / cascade purity — product hard law.
 *
 * Catalog of reported failure modes (ship 527e0b9a + 85382541 + errors.ts):
 *
 * | Case | Fixture focus | Bug observed | Law |
 * | ---- | ------------- | ------------ | --- |
 * | A | `app/api/users/route.ts` / stripe route | `next` treated as export | Focus packages are **Imports** |
 * | B | stripe route | `zod` on Export hops (import of intermediate file) | Intermediate packages are **Imports**, never Export* |
 * | C | `src/lib/redis.ts` | Consumers left / logger right felt “inverted” | Consumers = **Exports**; deps = **Imports** |
 * | D | `src/lib/http/errors.ts` | Services that **import** errors shown as Imports | Inbound importers = **Exports** only |
 * | E | any multi-hop | Import cascade absorbing export candidates (or reverse) | Cascades are pure each way |
 *
 * Hard rules (apply at every hop / any hub focus):
 * 1. **Imports / Import hop k** — only what the focus **imports** (outbound).
 * 2. **Exports / Export hop k** — only what **imports from** the focus (inbound).
 *
 * Goldens assert **category membership + graph honesty** (A→B means A imports B),
 * matching Carbon column categories used by the payload builder.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AlluvialPayload, CodeGraph, VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { isAlluvialRailName } from '@core/view/alluvial.ts';
import { projectFileHub } from '@core/view/fileHub.ts';

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
			out.push({ path: rel, content, byteLength: Buffer.byteLength(content) });
		}
	}
	return out;
}

function hub(
	graph: CodeGraph,
	fileId: string,
	maxDepth = 3,
): AlluvialPayload {
	const p = projectFileHub(graph, fileId, {
		maxDepth,
		maxImporters: 48,
		maxDeps: 48,
		weightAxis: 'import-edges',
	});
	expect(p, `hub for ${fileId}`).not.toBeNull();
	return p!;
}

function categoryOf(payload: AlluvialPayload, displayName: string): string | undefined {
	return payload.options.alluvial.nodes.find((n) => n.name === displayName)?.category;
}

function labelsForFile(payload: AlluvialPayload, fileId: string): string[] {
	return Object.entries(payload.meta.nodeRef)
		.filter(([, r]) => r.kind === 'file' && r.id === fileId)
		.map(([name]) => name);
}

function labelsForPackage(payload: AlluvialPayload, pkgId: string): string[] {
	return Object.entries(payload.meta.nodeRef)
		.filter(([, r]) => r.kind === 'package' && r.id === pkgId)
		.map(([name]) => name);
}

function isImportCategory(cat: string | undefined): boolean {
	return (
		cat === 'Imports' ||
		cat === 'External' ||
		(cat?.startsWith('Import hop') ?? false)
	);
}

function isExternalCategory(cat: string | undefined): boolean {
	return cat === 'External';
}

function isExportCategory(cat: string | undefined): boolean {
	return cat === 'Exports' || (cat?.startsWith('Export hop') ?? false);
}

/** True if graph has file→file edge from → to. */
function fileImportsFile(graph: CodeGraph, from: string, to: string): boolean {
	return graph.edges.some(
		(e) => e.from === from && e.toKind === 'file' && e.to === to,
	);
}

function fileImportsPackage(graph: CodeGraph, from: string, pkgId: string): boolean {
	return graph.edges.some(
		(e) => e.from === from && e.toKind === 'package' && e.to === pkgId,
	);
}

/** Direct importers of focus (file→focus). */
function directImporters(graph: CodeGraph, focusId: string): Set<string> {
	const s = new Set<string>();
	for (const e of graph.edges) {
		if (e.toKind === 'file' && e.to === focusId) s.add(e.from);
	}
	return s;
}

/** Direct file deps of focus. */
function directFileDeps(graph: CodeGraph, focusId: string): Set<string> {
	const s = new Set<string>();
	for (const e of graph.edges) {
		if (e.from === focusId && e.toKind === 'file') s.add(e.to);
	}
	return s;
}

describe('hub orientation hard law (golden catalog)', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));

	describe('Case D — errors.ts consumers are Exports, not Imports', () => {
		const focusId = 'src/lib/http/errors.ts';
		const consumers = [
			'src/services/inventoryService.ts',
			'src/services/orderService.ts',
			'src/services/userService.ts',
		];

		it('services that import errors sit on Exports only', () => {
			const payload = hub(graph, focusId);
			for (const c of consumers) {
				expect(fileImportsFile(graph, c, focusId), `${c} imports errors`).toBe(
					true,
				);
				const labs = labelsForFile(payload, c);
				expect(labs.length, `${c} projected`).toBeGreaterThan(0);
				for (const lab of labs) {
					const cat = categoryOf(payload, lab);
					expect(isExportCategory(cat), `${lab} cat=${cat}`).toBe(true);
					expect(isImportCategory(cat), `${lab} must not be Import*`).toBe(
						false,
					);
				}
			}
		});

		it('errors does not list consumers as File→ targets (would mean errors imports them)', () => {
			const payload = hub(graph, focusId);
			const focus = payload.meta.focus.label;
			const fromFile = payload.data.filter((l) => l.source === focus);
			for (const l of fromFile) {
				const ref = payload.meta.nodeRef[l.target];
				if (ref?.kind === 'file') {
					expect(
						consumers.includes(ref.id),
						`File must not edge to consumer ${ref.id}`,
					).toBe(false);
				}
			}
		});
	});

	describe('Case C — redis.ts deps Imports, consumers Exports', () => {
		const focusId = 'src/lib/redis.ts';

		it('logger (file dep) on Imports; ioredis (package) on External', () => {
			const payload = hub(graph, focusId);
			expect(fileImportsFile(graph, focusId, 'src/lib/logger.ts')).toBe(true);
			expect(fileImportsPackage(graph, focusId, 'ioredis')).toBe(true);

			const loggerLabs = labelsForFile(payload, 'src/lib/logger.ts');
			expect(loggerLabs.length).toBeGreaterThan(0);
			for (const lab of loggerLabs) {
				expect(isImportCategory(categoryOf(payload, lab))).toBe(true);
				expect(isExternalCategory(categoryOf(payload, lab))).toBe(false);
			}
			const ioLabs = labelsForPackage(payload, 'ioredis');
			expect(ioLabs.length).toBeGreaterThan(0);
			for (const lab of ioLabs) {
				expect(isExternalCategory(categoryOf(payload, lab))).toBe(true);
			}
		});

		it('direct consumers of redis on Exports, not Imports', () => {
			const payload = hub(graph, focusId);
			const importers = directImporters(graph, focusId);
			expect(importers.size).toBeGreaterThan(0);
			// Sample known consumers
			for (const c of [
				'src/services/orderService.ts',
				'src/lib/auth/session.ts',
			]) {
				if (!importers.has(c)) continue;
				const labs = labelsForFile(payload, c);
				if (!labs.length) continue; // may overflow
				for (const lab of labs) {
					expect(isExportCategory(categoryOf(payload, lab))).toBe(true);
				}
			}
		});
	});

	describe('Case A+B — stripe route packages on Imports, not Export hops', () => {
		const focusId = 'app/api/webhooks/stripe/route.ts';

		it('next (focus package import) on External', () => {
			const payload = hub(graph, focusId);
			expect(fileImportsPackage(graph, focusId, 'next')).toBe(true);
			const labs = labelsForPackage(payload, 'next');
			expect(labs.length).toBeGreaterThan(0);
			for (const lab of labs) {
				expect(isExternalCategory(categoryOf(payload, lab))).toBe(true);
				expect(isExportCategory(categoryOf(payload, lab))).toBe(false);
			}
		});

		it('zod never on Export* (lives on External via import-tree)', () => {
			const payload = hub(graph, focusId);
			const zodLabs = labelsForPackage(payload, 'zod');
			for (const lab of zodLabs) {
				const cat = categoryOf(payload, lab);
				expect(isExportCategory(cat), `zod on ${cat}`).toBe(false);
				expect(isExternalCategory(cat)).toBe(true);
			}
		});

		it('direct file deps of stripe route on Imports', () => {
			const payload = hub(graph, focusId);
			for (const dep of directFileDeps(graph, focusId)) {
				const labs = labelsForFile(payload, dep);
				if (!labs.length) continue;
				for (const lab of labs) {
					expect(isImportCategory(categoryOf(payload, lab))).toBe(true);
				}
			}
		});
	});

	describe('Case E — cascade purity membership', () => {
		it('no Export* file node is a direct file dep of focus (outbound)', () => {
			const focusId = 'src/lib/redis.ts';
			const payload = hub(graph, focusId);
			const deps = directFileDeps(graph, focusId);
			for (const n of payload.options.alluvial.nodes) {
				if (!isExportCategory(n.category)) continue;
				if (isAlluvialRailName(n.name)) continue;
				const ref = payload.meta.nodeRef[n.name];
				if (ref?.kind !== 'file') continue;
				expect(
					deps.has(ref.id),
					`export-side ${ref.id} must not be a focus file-dep`,
				).toBe(false);
			}
		});

		it('no Import* file node is a direct importer of focus (inbound)', () => {
			const focusId = 'src/lib/http/errors.ts';
			const payload = hub(graph, focusId);
			const importers = directImporters(graph, focusId);
			for (const n of payload.options.alluvial.nodes) {
				if (!isImportCategory(n.category)) continue;
				if (isAlluvialRailName(n.name)) continue;
				const ref = payload.meta.nodeRef[n.name];
				if (ref?.kind !== 'file') continue;
				expect(
					importers.has(ref.id),
					`import-side ${ref.id} must not be a reverse importer of focus`,
				).toBe(false);
			}
		});

		it('no package/unresolved on Export* categories', () => {
			for (const focusId of [
				'app/api/webhooks/stripe/route.ts',
				'src/lib/redis.ts',
				'src/components/UserCard.tsx',
			]) {
				// UserCard is react-simple
			}
			const payload = hub(graph, 'app/api/webhooks/stripe/route.ts');
			for (const n of payload.options.alluvial.nodes) {
				if (!isExportCategory(n.category)) continue;
				const ref = payload.meta.nodeRef[n.name];
				if (!ref) continue;
				expect(ref.kind, `${n.name} on ${n.category}`).not.toBe('package');
				expect(ref.kind).not.toBe('unresolved');
			}
		});
	});
});

describe('hub orientation hard law — demo-react-simple UserCard', () => {
	const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
	const focusId = 'src/components/UserCard.tsx';

	it('format/types (import cascade) on Imports; no zod on Export*', () => {
		const payload = hub(graph, focusId);
		for (const id of ['src/lib/format.ts', 'src/types.ts']) {
			const labs = labelsForFile(payload, id);
			expect(labs.length, id).toBeGreaterThan(0);
			for (const lab of labs) {
				expect(isImportCategory(categoryOf(payload, lab))).toBe(true);
			}
		}
		for (const lab of labelsForPackage(payload, 'zod')) {
			expect(isExportCategory(categoryOf(payload, lab))).toBe(false);
		}
	});

	it('re-hub types.ts: zod on External as focus package', () => {
		const payload = hub(graph, 'src/types.ts');
		const labs = labelsForPackage(payload, 'zod');
		expect(labs.length).toBeGreaterThan(0);
		for (const lab of labs) {
			expect(isExternalCategory(categoryOf(payload, lab))).toBe(true);
		}
	});
});
