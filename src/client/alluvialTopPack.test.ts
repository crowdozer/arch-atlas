import { describe, expect, it } from 'vitest';
import {
	centerHubFileSpine,
	hideAlluvialRails,
	isExportSideCategory,
	isFileCategory,
	isHubFileSpine,
	isImportRailLabel,
	markAlluvialExportTerminators,
	markAlluvialTerminators,
	polishAlluvialHolder,
	recomputeLinkBreadths,
	rightTruncateLabel,
	planExternalStraightBands,
	straightenExternalPackageBands,
} from './alluvialTopPack.ts';

type N = {
	name: string;
	category?: string;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	sourceLinks: { y0: number; y1: number; width: number; source: N; target: N }[];
	targetLinks: { y0: number; y1: number; width: number; source: N; target: N }[];
};

function node(
	name: string,
	x0: number,
	y0: number,
	h: number,
	category?: string,
): N {
	return {
		name,
		category,
		x0,
		x1: x0 + 10,
		y0,
		y1: y0 + h,
		sourceLinks: [],
		targetLinks: [],
	};
}

describe('rightTruncateLabel', () => {
	it('keeps short labels unchanged', () => {
		expect(rightTruncateLabel('src/a.ts', 36)).toBe('src/a.ts');
	});

	it('keeps the right end of long paths (basename side)', () => {
		const path = 'client/sim/very/deep/nested/module/public.ts';
		const out = rightTruncateLabel(path, 20);
		expect(out.startsWith('…')).toBe(true);
		expect(out.endsWith('public.ts')).toBe(true);
		expect(out.length).toBe(20);
	});
});

describe('recomputeLinkBreadths', () => {
	it('places link midpoints along the node edge in order', () => {
		const src = node('s', 0, 10, 100);
		const t1 = node('t1', 100, 10, 40);
		const t2 = node('t2', 100, 60, 40);
		const l1 = { y0: 0, y1: 0, width: 40, source: src, target: t1 };
		const l2 = { y0: 0, y1: 0, width: 60, source: src, target: t2 };
		src.sourceLinks = [l1, l2];
		t1.targetLinks = [l1];
		t2.targetLinks = [l2];

		recomputeLinkBreadths([src, t1, t2]);
		expect(l1.y0).toBe(10 + 20); // mid of first 40-wide band on source
		expect(l2.y0).toBe(10 + 40 + 30); // mid of second 60-wide band on source
		expect(l1.y1).toBe(10 + 20); // mid on t1 (only target link)
		expect(l2.y1).toBe(60 + 30); // mid on t2
	});
});

describe('centerHubFileSpine', () => {
	it('centers File with both in and out in the y-extent of side columns', () => {
		// Asymmetric hops: tall import stack left, short export right; File floated high
		const impA = node('a.ts', 0, 30, 40, 'Imports');
		const impB = node('b.ts', 0, 80, 120, 'Imports');
		const file = node('public.ts', 100, 30, 80, 'File');
		const expA = node('dep.ts', 200, 30, 50, 'Exports');

		const inL = { y0: 0, y1: 0, width: 40, source: impA, target: file };
		const inL2 = { y0: 0, y1: 0, width: 40, source: impB, target: file };
		const outL = { y0: 0, y1: 0, width: 50, source: file, target: expA };
		impA.sourceLinks.push(inL);
		impB.sourceLinks.push(inL2);
		file.targetLinks.push(inL, inL2);
		file.sourceLinks.push(outL);
		expA.targetLinks.push(outL);

		expect(isHubFileSpine(file)).toBe(true);
		expect(isHubFileSpine(impA)).toBe(false);

		const moved = centerHubFileSpine([impA, impB, file, expA]);
		expect(moved).toBeGreaterThan(0);

		// Others span 30..200; mid = 115; file h=80 → y0 = 75
		const mid = (30 + 200) / 2;
		expect(file.y0).toBeCloseTo(mid - 40, 5);
		expect(file.y1).toBeCloseTo(mid + 40, 5);
		// Side columns unchanged
		expect(impA.y0).toBe(30);
		expect(expA.y0).toBe(30);
	});

	it('no-op when File is source-only (reverse importers)', () => {
		const file = node('logger.ts', 0, 30, 100, 'File');
		const imp = node('a.ts', 100, 30, 50, 'Imports');
		const l = { y0: 0, y1: 0, width: 50, source: file, target: imp };
		file.sourceLinks.push(l);
		imp.targetLinks.push(l);
		expect(centerHubFileSpine([file, imp])).toBe(0);
		expect(file.y0).toBe(30);
	});
});

describe('isExportSideCategory', () => {
	it('matches export-side (yellow) categories only', () => {
		expect(isExportSideCategory('Exports')).toBe(true);
		expect(isExportSideCategory('Exporters')).toBe(true);
		expect(isExportSideCategory('Export hop 2')).toBe(true);
		expect(isExportSideCategory('Export hop 3')).toBe(true);
		expect(isExportSideCategory('Imports')).toBe(false);
		expect(isExportSideCategory('Import hop 2')).toBe(false);
		expect(isExportSideCategory('File')).toBe(false);
		expect(isExportSideCategory('Hop 1')).toBe(false);
	});
});

describe('isFileCategory / isImportRailLabel', () => {
	it('identifies File category and import (in-rail) labels only', () => {
		expect(isFileCategory('File')).toBe(true);
		expect(isFileCategory('Imports')).toBe(false);
		expect(isImportRailLabel('\u200b·in-rail·h2')).toBe(true);
		expect(isImportRailLabel('\u200b·out-rail·h1')).toBe(false);
		expect(isImportRailLabel('src/lib/x.ts')).toBe(false);
	});
});

/**
 * Minimal DOM tree for polish unit tests — **no Carbon mount**, no jsdom.
 * Implements the subset of Element APIs used by hide/mark/polish.
 */
class MiniClassList {
	private set = new Set<string>();
	constructor(initial: string[] = []) {
		for (const c of initial) this.set.add(c);
	}
	add(...tokens: string[]): void {
		for (const t of tokens) if (t) this.set.add(t);
	}
	contains(token: string): boolean {
		return this.set.has(token);
	}
	toString(): string {
		return [...this.set].join(' ');
	}
}

class MiniEl {
	tagName: string;
	classList: MiniClassList;
	children: MiniEl[] = [];
	parentElement: MiniEl | null = null;
	textContent = '';
	style: { display?: string; overflow?: string; fill?: string; stroke?: string } = {};
	attrs = new Map<string, string>();
	__data__?: unknown;
	id = '';

	constructor(tag: string, classNames: string[] = []) {
		this.tagName = tag.toUpperCase();
		this.classList = new MiniClassList(classNames);
	}

	appendChild(child: MiniEl): MiniEl {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value);
		if (name === 'id') this.id = value;
		if (name === 'class') {
			this.classList = new MiniClassList(value.split(/\s+/).filter(Boolean));
		}
	}

	getAttribute(name: string): string | null {
		return this.attrs.has(name) ? this.attrs.get(name)! : null;
	}

	removeAttribute(name: string): void {
		this.attrs.delete(name);
	}

	querySelectorAll(sel: string): MiniEl[] {
		return this.collect().filter((el) => el.matches(sel));
	}

	querySelector(sel: string): MiniEl | null {
		return this.querySelectorAll(sel)[0] ?? null;
	}

	private collect(): MiniEl[] {
		const out: MiniEl[] = [];
		const walk = (el: MiniEl) => {
			for (const c of el.children) {
				out.push(c);
				walk(c);
			}
		};
		walk(this);
		return out;
	}

	/** Very small selector subset: tag, .class, tag.class, [id*='x'], compound space. */
	matches(sel: string): boolean {
		const parts = sel.trim().split(/\s+/);
		if (parts.length > 1) {
			// descendant: not used from query root of self for compound in our code
			return false;
		}
		const s = parts[0]!;
		// attribute contains: g[id*="alluvial-node-title"] or g[id*='alluvial-node-title']
		const attr = s.match(/^(\w+)?\[id\*=['"]([^'"]+)['"]\]$/);
		if (attr) {
			const tag = attr[1];
			const needle = attr[2]!;
			if (tag && this.tagName !== tag.toUpperCase()) return false;
			return this.id.includes(needle) || (this.getAttribute('id') ?? '').includes(needle);
		}
		const m = s.match(/^(\w+)?(?:\.([\w-]+))?$/);
		if (!m) return false;
		const tag = m[1];
		const cls = m[2];
		if (tag && this.tagName !== tag.toUpperCase()) return false;
		if (cls && !this.classList.contains(cls)) return false;
		return true;
	}
}

/**
 * DOM fixture for pad-rail / terminator polish — **no Carbon mount**.
 * Gates class contract: rail hide, in-rail pad-band, out-rail paint, terminator wrap.
 */
describe('alluvial pad-rail / terminator polish (DOM fixture, no Carbon)', () => {
	function fixtureHolder(): MiniEl {
		const holder = new MiniEl('div');
		const svg = new MiniEl('svg');
		holder.appendChild(svg);

		// Real importer (terminator)
		const term = new MiniEl('g', ['node-group']);
		term.__data__ = {
			name: 'app/layout.tsx',
			category: 'Imports',
			x0: 0,
			x1: 10,
			y0: 0,
			y1: 20,
		};
		term.appendChild(new MiniEl('rect', ['node']));
		const termText = new MiniEl('text', ['node-text']);
		termText.textContent = 'app/layout.tsx (3)';
		term.appendChild(termText);
		svg.appendChild(term);

		// Import pad rail node
		const rail = new MiniEl('g', ['node-group']);
		rail.__data__ = {
			name: '\u200b·in-rail·h2',
			category: 'Import hop 2',
			x0: 0,
			x1: 10,
			y0: 30,
			y1: 50,
		};
		rail.appendChild(new MiniEl('rect', ['node']));
		const railText = new MiniEl('text', ['node-text']);
		railText.textContent = '\u200b·in-rail·h2 (57)';
		rail.appendChild(railText);
		svg.appendChild(rail);

		// Export out-rail node (bar hidden; bands stay painted)
		const outRail = new MiniEl('g', ['node-group']);
		outRail.__data__ = {
			name: '\u200b·out-rail·h1',
			category: 'Exports',
			x0: 100,
			x1: 110,
			y0: 0,
			y1: 20,
		};
		outRail.appendChild(new MiniEl('rect', ['node']));
		const outText = new MiniEl('text', ['node-text']);
		outText.textContent = '\u200b·out-rail·h1 (11)';
		outRail.appendChild(outText);
		svg.appendChild(outRail);

		// in-rail → non-External file (legacy dual-path style; still paints)
		const padPath = new MiniEl('path', ['link']);
		padPath.__data__ = {
			source: { name: '\u200b·in-rail·h2', category: 'Import hop 2' },
			target: { name: 'app/layout.tsx', category: 'Exports' },
			y0: 10,
			y1: 10,
			width: 3,
		};
		svg.appendChild(padPath);

		// External package hop: File → in-rail → package (undraw + straighten)
		const fileToRail = new MiniEl('path', ['link']);
		fileToRail.__data__ = {
			source: {
				name: 'src/lib/redis.ts',
				category: 'File',
				x0: 100,
				x1: 104,
				y0: 40,
				y1: 60,
			},
			target: {
				name: '\u200b·in-rail·h1',
				category: 'Imports',
				x0: 200,
				x1: 204,
				y0: 40,
				y1: 50,
			},
			y0: 50,
			y1: 45,
			width: 12,
			value: 12,
		};
		svg.appendChild(fileToRail);
		const railToPkg = new MiniEl('path', ['link']);
		railToPkg.__data__ = {
			source: {
				name: '\u200b·in-rail·h1',
				category: 'Imports',
				x0: 200,
				x1: 204,
				y0: 40,
				y1: 50,
			},
			target: {
				name: 'ioredis',
				category: 'External',
				x0: 300,
				x1: 304,
				y0: 40,
				y1: 52,
			},
			y0: 45,
			y1: 46,
			width: 12,
			value: 12,
		};
		svg.appendChild(railToPkg);

		// Nodes for straighten (File + External)
		const fileNode = new MiniEl('g', ['node-group']);
		fileNode.__data__ = {
			name: 'src/lib/redis.ts',
			category: 'File',
			x0: 100,
			x1: 104,
			y0: 40,
			y1: 60,
		};
		svg.appendChild(fileNode);
		const pkgNode = new MiniEl('g', ['node-group']);
		pkgNode.__data__ = {
			name: 'ioredis',
			category: 'External',
			x0: 300,
			x1: 304,
			y0: 40,
			y1: 52,
		};
		svg.appendChild(pkgNode);
		const inRail1 = new MiniEl('g', ['node-group']);
		inRail1.__data__ = {
			name: '\u200b·in-rail·h1',
			category: 'Imports',
			x0: 200,
			x1: 204,
			y0: 40,
			y1: 50,
		};
		svg.appendChild(inRail1);

		// Export mass: File → out-rail (must stay painted)
		const fileToOut = new MiniEl('path', ['link']);
		fileToOut.__data__ = {
			source: { name: 'UserCard.tsx' },
			target: { name: '\u200b·out-rail·h1' },
			y0: 10,
			y1: 10,
			width: 11,
		};
		svg.appendChild(fileToOut);

		// Export mass: out-rail → deep target (must stay painted)
		const outToDeep = new MiniEl('path', ['link']);
		outToDeep.__data__ = {
			source: { name: '\u200b·out-rail·h1' },
			target: { name: 'src/types.ts' },
			y0: 10,
			y1: 10,
			width: 11,
		};
		svg.appendChild(outToDeep);

		// Real band: importer → File
		const realPath = new MiniEl('path', ['link']);
		realPath.__data__ = {
			source: { name: 'app/layout.tsx' },
			target: { name: 'src/lib/redis.ts' },
			y0: 10,
			y1: 10,
			width: 3,
		};
		svg.appendChild(realPath);

		return holder;
	}

	it('hides rail nodes; in-rail pad-band; out-rail links stay paint-eligible', () => {
		const holder = fixtureHolder();
		hideAlluvialRails(holder as unknown as HTMLElement);

		const railG = holder.querySelectorAll('g.node-group').find((g) =>
			String((g.__data__ as { name?: string })?.name ?? '').includes('in-rail'),
		);
		expect(railG?.classList.contains('atlas-alluvial-rail')).toBe(true);

		const outRailG = holder.querySelectorAll('g.node-group').find((g) =>
			String((g.__data__ as { name?: string })?.name ?? '').includes('out-rail'),
		);
		// Out-rail **nodes** still hide chrome
		expect(outRailG?.classList.contains('atlas-alluvial-rail')).toBe(true);

		// in-rail → non-External file is not a package hop (still paint)
		const inToFile = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				String(d?.source?.name ?? '').includes('in-rail') &&
				d?.target?.name === 'app/layout.tsx'
			);
		});
		expect(inToFile?.classList.contains('atlas-alluvial-pad-band')).toBe(false);

		// Pure in-rail → in-rail still scaffold if present
		const railToRail = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				String(d?.source?.name ?? '').includes('in-rail') &&
				String(d?.target?.name ?? '').includes('in-rail')
			);
		});
		// fixture may not have rail→rail; only assert when present
		if (railToRail) {
			expect(railToRail.classList.contains('atlas-alluvial-pad-band')).toBe(true);
		}

		// Out-rail free-source pads undrawn (reverse terminator cutoff)
		const fileToOut = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				d?.source?.name === 'UserCard.tsx' &&
				String(d?.target?.name ?? '').includes('out-rail')
			);
		});
		expect(fileToOut?.classList.contains('atlas-alluvial-pad-band')).toBe(true);

		const outToDeep = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				String(d?.source?.name ?? '').includes('out-rail') &&
				d?.target?.name === 'src/types.ts'
			);
		});
		expect(outToDeep?.classList.contains('atlas-alluvial-pad-band')).toBe(true);

		const real = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as { source?: { name?: string } };
			return d?.source?.name === 'app/layout.tsx';
		});
		expect(real?.classList.contains('atlas-alluvial-pad-band')).toBe(false);

		// External package hop undrawn
		const fileToRail = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				d?.source?.name === 'src/lib/redis.ts' &&
				String(d?.target?.name ?? '').includes('in-rail')
			);
		});
		expect(fileToRail?.classList.contains('atlas-alluvial-pad-band')).toBe(true);
		const railToPkg = holder.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				String(d?.source?.name ?? '').includes('in-rail') &&
				d?.target?.name === 'ioredis'
			);
		});
		expect(railToPkg?.classList.contains('atlas-alluvial-pad-band')).toBe(true);
	});

	it('plans straight External bands for File→in-rail→package topology', () => {
		const plans = planExternalStraightBands(
			[
				{
					name: 'src/lib/redis.ts',
					category: 'File',
					x0: 100,
					x1: 104,
					y0: 40,
					y1: 60,
				},
				{
					name: '\u200b·in-rail·h1',
					category: 'Imports',
					x0: 200,
					x1: 204,
					y0: 40,
					y1: 50,
				},
				{
					name: 'ioredis',
					category: 'External',
					x0: 300,
					x1: 304,
					y0: 40,
					y1: 52,
				},
			],
			[
				{
					source: 'src/lib/redis.ts',
					target: '\u200b·in-rail·h1',
					width: 12,
					stroke: '#14b8a6',
				},
				{
					source: '\u200b·in-rail·h1',
					target: 'ioredis',
					width: 12,
					stroke: '#14b8a6',
				},
			],
		);
		expect(plans).toHaveLength(1);
		expect(plans[0]!.parent).toBe('src/lib/redis.ts');
		expect(plans[0]!.packageName).toBe('ioredis');
		expect(plans[0]!.width).toBe(12);
		// Spans File x1 → package x0 (skips Imports rail x)
		expect(plans[0]!.x0).toBe(104);
		expect(plans[0]!.x1).toBe(300);
	});

	it('does not plan straighten for direct File→package (no pad)', () => {
		const plans = planExternalStraightBands(
			[
				{
					name: 'src/lib/redis.ts',
					category: 'File',
					x0: 100,
					x1: 104,
					y0: 40,
					y1: 60,
				},
				{
					name: 'ioredis',
					category: 'External',
					x0: 200,
					x1: 204,
					y0: 40,
					y1: 52,
				},
			],
			[
				{
					source: 'src/lib/redis.ts',
					target: 'ioredis',
					width: 12,
				},
			],
		);
		expect(plans).toHaveLength(0);
	});

	it('hide + straighten is safe on MiniEl fixture (no throw)', () => {
		const holder = fixtureHolder();
		expect(() => {
			hideAlluvialRails(holder as unknown as HTMLElement);
			straightenExternalPackageBands(holder as unknown as HTMLElement);
		}).not.toThrow();
	});

	it('marks terminators with contrast classes; polish wires both', () => {
		const holder = fixtureHolder();
		// Reverse free sources → cyan class
		markAlluvialTerminators(holder as unknown as HTMLElement, [
			'app/layout.tsx',
		]);
		const term = holder.querySelectorAll('g.node-group').find(
			(g) => (g.__data__ as { name?: string })?.name === 'app/layout.tsx',
		);
		expect(
			term?.classList.contains('atlas-alluvial-export-terminator'),
		).toBe(true);

		// Forward leaves → yellow class
		markAlluvialExportTerminators(holder as unknown as HTMLElement, [
			'ioredis',
		]);
		const fwd = holder.querySelectorAll('g.node-group').find(
			(g) => (g.__data__ as { name?: string })?.name === 'ioredis',
		);
		expect(fwd?.classList.contains('atlas-alluvial-terminator')).toBe(true);

		const holder2 = fixtureHolder();
		polishAlluvialHolder(holder2 as unknown as HTMLElement, {
			terminators: ['app/layout.tsx'],
			exportTerminators: ['ioredis'],
		});
		const railG = holder2.querySelectorAll('g.node-group').find((g) =>
			String((g.__data__ as { name?: string })?.name ?? '').includes('in-rail'),
		);
		const term2 = holder2.querySelectorAll('g.node-group').find(
			(g) => (g.__data__ as { name?: string })?.name === 'app/layout.tsx',
		);
		const fwd2 = holder2.querySelectorAll('g.node-group').find(
			(g) => (g.__data__ as { name?: string })?.name === 'ioredis',
		);
		const outToDeep = holder2.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				String(d?.source?.name ?? '').includes('out-rail') &&
				d?.target?.name === 'src/types.ts'
			);
		});
		expect(railG?.classList.contains('atlas-alluvial-rail')).toBe(true);
		expect(
			term2?.classList.contains('atlas-alluvial-export-terminator'),
		).toBe(true);
		expect(fwd2?.classList.contains('atlas-alluvial-terminator')).toBe(true);
		// Out-rail free-source pads undrawn (terminator band cutoff)
		expect(outToDeep?.classList.contains('atlas-alluvial-pad-band')).toBe(true);
	});
});
