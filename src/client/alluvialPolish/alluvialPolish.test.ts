import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '@core/graph/types.ts';
import { indexFiles } from '@core/index.ts';
import { isAlluvialRailName } from '@core/view/alluvial.ts';
import { projectFileHub } from '@core/view/fileHub.ts';
import {
	carbonAlluvialLabelTitleOffset,
	centerHubFileSpine,
	hideAlluvialRails,
	isExportSideCategory,
	isExternalStraightPairLink,
	isFileCategory,
	isHubFileSpine,
	isImportRailLabel,
	markAlluvialExportTerminators,
	markAlluvialTerminators,
	polishAlluvialHolder,
	recomputeLinkBreadths,
	rightTruncateAlluvialLabels,
	rightTruncateLabel,
	planExternalStraightBands,
	straightenExternalPackageBands,
} from './index.ts';

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
			out.push({ path: rel, content, byteLength: Buffer.byteLength(content) });
		}
	}
	return out;
}

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

describe('carbonAlluvialLabelTitleOffset', () => {
	it('hangs left when node.x1 >= textWidth', () => {
		const o = carbonAlluvialLabelTitleOffset(
			{ x0: 100, x1: 110, y0: 0, y1: 40 },
			50,
		);
		// barW=10; hang left: 10 - (50+16) = -56; y = 20 - 9
		expect(o.x).toBe(-56);
		expect(o.y).toBe(11);
	});

	it('places right of bar when node.x1 < textWidth', () => {
		const o = carbonAlluvialLabelTitleOffset(
			{ x0: 0, x1: 10, y0: 0, y1: 20 },
			200,
		);
		expect(o.x).toBe(14); // barW + 4
		expect(o.y).toBe(1);
	});

	it('keeps left-hang right edge snug to bar after truncate', () => {
		const node = { x0: 200, x1: 210, y0: 0, y1: 30 };
		const fullT = 180;
		const truncT = 100;
		const full = carbonAlluvialLabelTitleOffset(node, fullT);
		const trunc = carbonAlluvialLabelTitleOffset(node, truncT);
		// Without re-anchor, chip would stay at full.x and end far left of bar
		expect(trunc.x).toBeGreaterThan(full.x);
		// With re-anchor, text right edge stays barW - 16 from node origin
		expect(full.x + fullT).toBe(10 - 16);
		expect(trunc.x + truncT).toBe(10 - 16);
	});
});

describe('rightTruncateAlluvialLabels re-anchors Carbon title chips', () => {
	it('shrinks bg and rewrites title transform for truncated hang-left labels', () => {
		const holder = new MiniEl('div');
		const svg = new MiniEl('svg');
		holder.appendChild(svg);

		const nodeG = new MiniEl('g', ['node-group']);
		nodeG.__data__ = {
			name: 'client/sim/very/deep/nested/module/public.ts',
			category: 'Exports',
			x0: 200,
			x1: 210,
			y0: 10,
			y1: 40,
		};
		const titleG = new MiniEl('g');
		titleG.setAttribute('id', 'alluvial-node-title-0');
		// Carbon full-string hang (text ~180px): barW - (180+16)
		titleG.setAttribute('transform', 'translate(-186, 6)');

		const text = new MiniEl('text', ['node-text']);
		const full =
			'client/sim/very/deep/nested/module/public.ts (12)';
		text.textContent = full;
		// ~6.5px/char stand-in; after truncate length drives measure
		text.getComputedTextLength = function (this: MiniEl) {
			return (this.textContent?.length ?? 0) * 6.5;
		};

		const bg = new MiniEl('rect', ['node-text-bg']);
		bg.setAttribute('width', '200');
		bg.setAttribute('height', '18');

		titleG.appendChild(text);
		titleG.appendChild(bg);
		nodeG.appendChild(titleG);
		svg.appendChild(nodeG);

		rightTruncateAlluvialLabels(holder as unknown as HTMLElement, 20);

		const painted = text.textContent ?? '';
		expect(painted.startsWith('…')).toBe(true);
		expect(painted).toContain('(12)');

		const textW = (painted.length) * 6.5;
		const expected = carbonAlluvialLabelTitleOffset(
			nodeG.__data__ as {
				x0: number;
				x1: number;
				y0: number;
				y1: number;
			},
			textW,
		);
		expect(titleG.getAttribute('transform')).toBe(
			`translate(${expected.x}, ${expected.y})`,
		);
		expect(Number(bg.getAttribute('width'))).toBe(Math.ceil(textW + 8));
		// Must not leave the full-string hang offset
		expect(titleG.getAttribute('transform')).not.toBe('translate(-186, 6)');
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
			category: 'External', // package terminator → purple
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

	it('userService hub meta pairs: planner draws true External attachments only', () => {
		const { graph } = indexFiles(
			walkFixtures(path.join(fixturesRoot, 'demo-next-complex')),
		);
		const payload = projectFileHub(graph, 'src/services/userService.ts', {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
			weightAxis: 'import-edges',
		})!;
		const pairs = payload.meta.externalStraightPairs ?? [];
		expect(pairs.length).toBeGreaterThan(0);

		// Synthetic layout geometry from payload nodes + data (pad topology intact)
		const nodes = payload.options.alluvial.nodes.map((n, i) => ({
			name: n.name,
			category: n.category,
			x0: n.category === 'External' ? 300 : isAlluvialRailName(n.name) ? 200 : 100,
			x1: n.category === 'External' ? 304 : isAlluvialRailName(n.name) ? 204 : 104,
			y0: i * 20,
			y1: i * 20 + 12,
		}));
		const links = payload.data.map((l) => ({
			source: l.source,
			target: l.target,
			width: l.value,
		}));

		const bfs = planExternalStraightBands(nodes, links);
		const planned = planExternalStraightBands(nodes, links, pairs);
		// Shared-rail BFS overdraws; construction pairs stay parent-true
		expect(bfs.length).toBeGreaterThan(planned.length);
		expect(planned.length).toBeGreaterThan(0);

		const key = (parent: string, pkg: string) => `${parent}\0${pkg}`;
		const plannedKeys = new Set(
			planned.map((p) => key(p.parent, p.packageName)),
		);
		const labelFor = (fileId: string) =>
			Object.entries(payload.meta.nodeRef).find(
				([, r]) => r.kind === 'file' && r.id === fileId,
			)?.[0];
		const pkgLabel = (pkgId: string) =>
			Object.entries(payload.meta.nodeRef).find(
				([, r]) => r.kind === 'package' && r.id === pkgId,
			)?.[0];

		const redis = labelFor('src/lib/redis.ts')!;
		const email = labelFor('src/lib/email.ts')!;
		const typesUser = labelFor('src/types/user.ts')!;
		const ioredis = pkgLabel('ioredis')!;
		const nodemailer = pkgLabel('nodemailer')!;
		const zod = pkgLabel('zod')!;

		expect(plannedKeys.has(key(redis, ioredis))).toBe(true);
		expect(plannedKeys.has(key(email, nodemailer))).toBe(true);
		expect(plannedKeys.has(key(typesUser, zod))).toBe(true);
		expect(plannedKeys.has(key(email, ioredis))).toBe(false);
		expect(plannedKeys.has(key(redis, nodemailer))).toBe(false);
		expect(plannedKeys.has(key(typesUser, ioredis))).toBe(false);
	});

	it('shared in-rail multi-parent: pairs avoid cross-product; BFS alone overdraws', () => {
		// Topology: redis/email/types → same ·in-rail·h2 → ioredis/nodemailer/zod
		const rail = '\u200b·in-rail·h2';
		const nodes = [
			{
				name: 'src/lib/redis.ts',
				category: 'Imports',
				x0: 100,
				x1: 104,
				y0: 10,
				y1: 30,
			},
			{
				name: 'src/lib/email.ts',
				category: 'Imports',
				x0: 100,
				x1: 104,
				y0: 40,
				y1: 60,
			},
			{
				name: 'src/types/user.ts',
				category: 'Imports',
				x0: 100,
				x1: 104,
				y0: 70,
				y1: 90,
			},
			{
				name: rail,
				category: 'Import hop 2',
				x0: 200,
				x1: 204,
				y0: 20,
				y1: 80,
			},
			{
				name: 'ioredis',
				category: 'External',
				x0: 300,
				x1: 304,
				y0: 10,
				y1: 30,
			},
			{
				name: 'nodemailer',
				category: 'External',
				x0: 300,
				x1: 304,
				y0: 40,
				y1: 60,
			},
			{
				name: 'zod',
				category: 'External',
				x0: 300,
				x1: 304,
				y0: 70,
				y1: 90,
			},
		];
		const links = [
			{ source: 'src/lib/redis.ts', target: rail, width: 1 },
			{ source: 'src/lib/email.ts', target: rail, width: 1 },
			{ source: 'src/types/user.ts', target: rail, width: 1 },
			{ source: rail, target: 'ioredis', width: 1 },
			{ source: rail, target: 'nodemailer', width: 1 },
			{ source: rail, target: 'zod', width: 1 },
		];
		const bfs = planExternalStraightBands(nodes, links);
		// 3 parents × 3 packages on shared rail
		expect(bfs).toHaveLength(9);

		const pairs = [
			{ parent: 'src/lib/redis.ts', packageName: 'ioredis', width: 1 },
			{ parent: 'src/lib/email.ts', packageName: 'nodemailer', width: 1 },
			{ parent: 'src/types/user.ts', packageName: 'zod', width: 1 },
		];
		const planned = planExternalStraightBands(nodes, links, pairs);
		expect(planned).toHaveLength(3);
		const keys = new Set(planned.map((p) => `${p.parent}\0${p.packageName}`));
		expect(keys.has('src/lib/redis.ts\0ioredis')).toBe(true);
		expect(keys.has('src/lib/email.ts\0nodemailer')).toBe(true);
		expect(keys.has('src/types/user.ts\0zod')).toBe(true);
		expect(keys.has('src/lib/email.ts\0ioredis')).toBe(false);
		expect(keys.has('src/lib/redis.ts\0nodemailer')).toBe(false);
		expect(keys.has('src/lib/redis.ts\0zod')).toBe(false);
	});

	it('hide + straighten is safe on MiniEl fixture (no throw)', () => {
		const holder = fixtureHolder();
		expect(() => {
			hideAlluvialRails(holder as unknown as HTMLElement);
			straightenExternalPackageBands(holder as unknown as HTMLElement);
		}).not.toThrow();
	});

	it('main.tsx react: 4 pairs; undraw direct deepest attach; straighten 4 once', () => {
		// Default weight axis expands full import tree (import-edges starves branches).
		const { graph } = indexFiles(
			walkFixtures(path.join(fixturesRoot, 'demo-react-simple')),
		);
		const payload = projectFileHub(graph, 'src/main.tsx', {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
		})!;
		const pairs = payload.meta.externalStraightPairs ?? [];
		expect(pairs.length, 'construction pairs present').toBeGreaterThan(0);

		const labelFor = (fileId: string) =>
			Object.entries(payload.meta.nodeRef).find(
				([, r]) => r.kind === 'file' && r.id === fileId,
			)?.[0];
		const pkgLabel = (pkgId: string) =>
			Object.entries(payload.meta.nodeRef).find(
				([, r]) => r.kind === 'package' && r.id === pkgId,
			)?.[0];

		const react = pkgLabel('react')!;
		const useUser = labelFor('src/hooks/useUser.ts')!;
		const main = labelFor('src/main.tsx')!;
		const layout = labelFor('src/components/Layout.tsx')!;
		const home = labelFor('src/pages/Home.tsx')!;
		expect(react && useUser && main && layout && home).toBeTruthy();

		const reactPairs = pairs.filter((p) => p.packageName === react);
		// True importers of react under main hub: main, Layout, Home, useUser
		expect(reactPairs).toHaveLength(4);
		const parents = new Set(reactPairs.map((p) => p.parent));
		expect(parents.has(main)).toBe(true);
		expect(parents.has(layout)).toBe(true);
		expect(parents.has(home)).toBe(true);
		expect(parents.has(useUser)).toBe(true);

		// Payload topology: deepest useUser→react is direct (no rail pad)
		const directUseUser = payload.data.find(
			(l) => l.source === useUser && l.target === react,
		);
		expect(directUseUser, 'useUser→react is direct Carbon link').toBeTruthy();
		expect(isExternalStraightPairLink(useUser, react, pairs)).toBe(true);

		// Undraw: with pairs, direct attach is pad-band; without pairs, not
		const mkHolder = () => {
			const holder = new MiniEl('div', ['ui-carbon-chart']);
			const svg = new MiniEl('svg', []);
			holder.appendChild(svg);
			const path = new MiniEl('path', ['link']);
			path.__data__ = {
				source: { name: useUser, category: 'Import hop 3' },
				target: { name: react, category: 'External' },
				width: 1,
			};
			svg.appendChild(path);
			// Scaffold control: parent→in-rail still undrawn without pairs
			const railPath = new MiniEl('path', ['link']);
			railPath.__data__ = {
				source: { name: home },
				target: { name: '\u200b·in-rail·h3' },
				width: 1,
			};
			svg.appendChild(railPath);
			return holder;
		};

		const bare = mkHolder();
		hideAlluvialRails(bare as unknown as HTMLElement);
		const bareDirect = bare.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return d?.source?.name === useUser && d?.target?.name === react;
		});
		expect(bareDirect?.classList.contains('atlas-alluvial-pad-band')).toBe(
			false,
		);

		const withPairs = mkHolder();
		hideAlluvialRails(withPairs as unknown as HTMLElement, { pairs });
		const undrawnDirect = withPairs.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return d?.source?.name === useUser && d?.target?.name === react;
		});
		expect(undrawnDirect?.classList.contains('atlas-alluvial-pad-band')).toBe(
			true,
		);
		expect(
			undrawnDirect?.classList.contains('atlas-alluvial-external-pad'),
		).toBe(true);
		// Pairless scaffold undraw still works when pairs present
		const railUndraw = withPairs.querySelectorAll('path.link').find((p) => {
			const d = p.__data__ as {
				source?: { name?: string };
				target?: { name?: string };
			};
			return (
				d?.source?.name === home &&
				String(d?.target?.name ?? '').includes('in-rail')
			);
		});
		expect(railUndraw?.classList.contains('atlas-alluvial-pad-band')).toBe(
			true,
		);

		// Straighten plans: one band per true parent (not Carbon+straighten double)
		const nodes = payload.options.alluvial.nodes.map((n, i) => ({
			name: n.name,
			category: n.category,
			x0: n.category === 'External' ? 300 : isAlluvialRailName(n.name) ? 200 : 100,
			x1: n.category === 'External' ? 304 : isAlluvialRailName(n.name) ? 204 : 104,
			y0: i * 20,
			y1: i * 20 + 12,
		}));
		const links = payload.data.map((l) => ({
			source: l.source,
			target: l.target,
			width: l.value,
		}));
		const planned = planExternalStraightBands(nodes, links, pairs);
		const reactPlans = planned.filter((p) => p.packageName === react);
		expect(reactPlans).toHaveLength(4);
		const planParents = new Set(reactPlans.map((p) => p.parent));
		expect(planParents.has(useUser)).toBe(true);
		expect(planParents.has(main)).toBe(true);
		expect(planParents.has(layout)).toBe(true);
		expect(planParents.has(home)).toBe(true);
		// Unique parents only — undrawn direct + straighten = 4, not 5 visual sources
		expect(planParents.size).toBe(4);
	});

	it('types.ts→zod: pairs-only direct File→pkg still straightens (no rail gate)', () => {
		// After pair undraw, packages with only direct attaches must still get
		// a straighten plan — otherwise External vanishes (types.ts hub).
		const { graph } = indexFiles(
			walkFixtures(path.join(fixturesRoot, 'demo-react-simple')),
		);
		const payload = projectFileHub(graph, 'src/types.ts', {
			maxDepth: 3,
			maxImporters: 48,
			maxDeps: 48,
			weightAxis: 'import-edges',
		})!;
		const pairs = payload.meta.externalStraightPairs ?? [];
		const zodPair = pairs.find((p) => p.packageName === 'zod');
		expect(zodPair, 'types→zod construction pair').toBeTruthy();
		expect(zodPair!.parent).toBe('src/types.ts');

		const direct = payload.data.find(
			(l) => l.source === 'src/types.ts' && l.target === 'zod',
		);
		expect(direct, 'payload File→zod').toBeTruthy();
		// No in-rail into zod on pure focus-package chart
		const railIntoZod = payload.data.some(
			(l) =>
				l.target === 'zod' &&
				String(l.source).includes('in-rail'),
		);
		expect(railIntoZod, 'no pad rails required').toBe(false);

		const nodes = payload.options.alluvial.nodes.map((n, i) => ({
			name: n.name,
			category: n.category,
			x0: n.category === 'External' ? 300 : 100,
			x1: n.category === 'External' ? 304 : 104,
			y0: i * 16,
			y1: i * 16 + 10,
		}));
		const links = payload.data.map((l) => ({
			source: l.source,
			target: l.target,
			width: l.value,
		}));
		// Without pairs: rail-gated planner must not invent straighten
		expect(planExternalStraightBands(nodes, links)).toHaveLength(0);
		// With pairs: one straight types→zod band
		const planned = planExternalStraightBands(nodes, links, pairs);
		const zodPlans = planned.filter((p) => p.packageName === 'zod');
		expect(zodPlans).toHaveLength(1);
		expect(zodPlans[0]!.parent).toBe('src/types.ts');

		// Undraw File→zod when pairs present
		const holder = new MiniEl('div', ['ui-carbon-chart']);
		const svg = new MiniEl('svg', []);
		holder.appendChild(svg);
		const linkEl = new MiniEl('path', ['link']);
		linkEl.__data__ = {
			source: { name: 'src/types.ts', category: 'File' },
			target: { name: 'zod', category: 'External' },
			width: 1,
		};
		svg.appendChild(linkEl);
		hideAlluvialRails(holder as unknown as HTMLElement, { pairs });
		expect(linkEl.classList.contains('atlas-alluvial-pad-band')).toBe(true);
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

		// Package leaves → purple class
		markAlluvialExportTerminators(holder as unknown as HTMLElement, [
			'ioredis',
		]);
		const pkg = holder.querySelectorAll('g.node-group').find(
			(g) => (g.__data__ as { name?: string })?.name === 'ioredis',
		);
		expect(
			pkg?.classList.contains('atlas-alluvial-package-terminator'),
		).toBe(true);

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
		const pkg2 = holder2.querySelectorAll('g.node-group').find(
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
		expect(
			pkg2?.classList.contains('atlas-alluvial-package-terminator'),
		).toBe(true);
		// Out-rail free-source pads undrawn (terminator band cutoff)
		expect(outToDeep?.classList.contains('atlas-alluvial-pad-band')).toBe(true);
	});
});
