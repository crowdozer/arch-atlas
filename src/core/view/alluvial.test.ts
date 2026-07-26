import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { projectAlluvial } from '@core/view/alluvial.ts';

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

function flowTotals(data: { source: string; target: string; value: number }[]) {
	const out = new Map<string, number>();
	const inn = new Map<string, number>();
	for (const l of data) {
		out.set(l.source, (out.get(l.source) ?? 0) + l.value);
		inn.set(l.target, (inn.get(l.target) ?? 0) + l.value);
	}
	return { out, inn };
}

describe('projectAlluvial conservation', () => {
	it('conserves module in/out on next middleware start', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-next-complex')));
		const payload = projectAlluvial(graph, 'middleware.ts');
		expect(payload).not.toBeNull();
		const { out, inn } = flowTotals(payload!.data);

		const modules = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Modules')
			.map((n) => n.name);

		for (const m of modules) {
			expect(inn.get(m) ?? 0, `module ${m} inflow`).toBe(out.get(m) ?? 0);
		}

		// code inflow equals total end outflow
		const ends = payload!.options.alluvial.nodes
			.filter((n) => n.category === 'Ends')
			.map((n) => n.name);
		const endOut = ends.reduce((s, e) => s + (out.get(e) ?? 0), 0);
		const codeIn = inn.get('middleware.ts') ?? 0;
		expect(codeIn).toBe(endOut);
		expect(codeIn).toBeGreaterThan(0);
	});

	it('react main keeps modules→code flow conserved', () => {
		const { graph } = indexFiles(walk(path.join(fixturesRoot, 'demo-react-simple')));
		const payload = projectAlluvial(graph, 'src/main.tsx');
		expect(payload).not.toBeNull();
		const { out, inn } = flowTotals(payload!.data);
		for (const n of payload!.options.alluvial.nodes) {
			if (n.category !== 'Modules') continue;
			expect(inn.get(n.name) ?? 0).toBe(out.get(n.name) ?? 0);
		}
	});
});
