/**
 * FocusApply observability - D1–D5 on MiniEl post-polish fixture.
 */
import { describe, expect, it } from 'vitest';
import {
	applyFocusPlan,
	classifyDrawnBands,
	clearFocusPlan,
	CLASS_CARBON_DIM,
	CLASS_CARBON_FOCUS,
	CLASS_DIMMING,
	CLASS_LABEL_FOCUS,
	CLASS_PAD_BAND,
	CLASS_STRAIGHT_FOCUS,
} from './focusApply.ts';
import { listDrawnBandsFromHolder } from './displayInventory.ts';
import {
	externalBandKey,
	fileBandKey,
	type FocusPlan,
	type FocusSeed,
} from './logicalFocusGraph.ts';

/** Minimal DOM tree for apply tests - subset of Element used by focusApply. */
class MiniClassList {
	private set = new Set<string>();
	constructor(initial: string[] = []) {
		for (const c of initial) this.set.add(c);
	}
	add(...tokens: string[]): void {
		for (const t of tokens) if (t) this.set.add(t);
	}
	remove(...tokens: string[]): void {
		for (const t of tokens) this.set.delete(t);
	}
	contains(token: string): boolean {
		return this.set.has(token);
	}
	toggle(token: string, force?: boolean): boolean {
		const on = force !== undefined ? force : !this.set.has(token);
		if (on) this.set.add(token);
		else this.set.delete(token);
		return on;
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
	style: {
		display?: string;
		strokeOpacity?: string;
		fillOpacity?: string;
		opacity?: string;
		removeProperty?: (p: string) => void;
	};
	attrs = new Map<string, string>();
	__data__?: unknown;
	id = '';
	dataset: Record<string, string> = {};

	constructor(tag: string, classNames: string[] = []) {
		this.tagName = tag.toUpperCase();
		this.classList = new MiniClassList(classNames);
		const style: MiniEl['style'] = {};
		style.removeProperty = (p: string) => {
			if (p === 'stroke-opacity') delete style.strokeOpacity;
			if (p === 'fill-opacity') delete style.fillOpacity;
			if (p === 'opacity') delete style.opacity;
		};
		this.style = style;
	}

	appendChild(child: MiniEl): MiniEl {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value);
		if (name === 'id') this.id = value;
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

	matches(sel: string): boolean {
		if (sel === 'g.node-group') {
			return this.tagName === 'G' && this.classList.contains('node-group');
		}
		if (sel === 'path.link') {
			return this.tagName === 'PATH' && this.classList.contains('link');
		}
		if (sel === 'path.atlas-alluvial-external-straight') {
			return (
				this.tagName === 'PATH' &&
				this.classList.contains('atlas-alluvial-external-straight')
			);
		}
		if (sel === 'text.node-text') {
			return this.tagName === 'TEXT' && this.classList.contains('node-text');
		}
		if (sel.startsWith('g[id*=')) {
			const needle = sel.match(/id\*="([^"]+)"/)?.[1] ?? '';
			return this.tagName === 'G' && this.id.includes(needle);
		}
		return false;
	}
}

function mkNode(name: string): MiniEl {
	const g = new MiniEl('g', ['node-group']);
	g.__data__ = { name };
	const title = new MiniEl('g', []);
	title.id = `alluvial-node-title-${name}`;
	title.setAttribute('id', title.id);
	const text = new MiniEl('text', ['node-text']);
	text.textContent = name;
	title.appendChild(text);
	g.appendChild(title);
	return g;
}

function mkCarbonPath(source: string, target: string, pad = false): MiniEl {
	const p = new MiniEl('path', pad ? ['link', CLASS_PAD_BAND] : ['link']);
	p.__data__ = {
		source: { name: source },
		target: { name: target },
	};
	p.style.strokeOpacity = '0.5';
	return p;
}

function mkStraight(parent: string, pkg: string): MiniEl {
	const p = new MiniEl('path', [
		'link',
		'atlas-alluvial-external-straight',
	]);
	p.__data__ = {
		source: { name: parent },
		target: { name: pkg },
	};
	return p;
}

/**
 * Post-polish fixture: main→App, main→logger carbon; pad undrawn pair;
 * straighten main→react + main→react-dom.
 */
function polishedHolder(): MiniEl {
	const holder = new MiniEl('div', ['ui-carbon-chart']);
	const svg = new MiniEl('svg', []);
	holder.appendChild(svg);
	for (const n of [
		'src/main.tsx',
		'src/App.tsx',
		'src/lib/logger.ts',
		'react',
		'react-dom',
	]) {
		svg.appendChild(mkNode(n));
	}
	svg.appendChild(mkCarbonPath('src/main.tsx', 'src/App.tsx'));
	svg.appendChild(mkCarbonPath('src/main.tsx', 'src/lib/logger.ts'));
	// undrawn pair-covered (pad)
	svg.appendChild(mkCarbonPath('src/main.tsx', 'react', true));
	// straighten
	svg.appendChild(mkStraight('src/main.tsx', 'react'));
	svg.appendChild(mkStraight('src/main.tsx', 'react-dom'));
	return holder;
}

function planOf(
	seed: FocusSeed,
	active: string[],
	keys: string[],
): FocusPlan {
	return {
		seed,
		activeLabels: new Set(active),
		focusedBandKeys: new Set(keys),
		drillTarget: null,
	};
}

function bandState(holder: MiniEl): {
	focus: string[];
	dim: string[];
	straightFocus: string[];
	padFocus: boolean;
} {
	const focus: string[] = [];
	const dim: string[] = [];
	const straightFocus: string[] = [];
	let padFocus = false;
	for (const p of holder.querySelectorAll('path.link')) {
		const d = p.__data__ as {
			source?: { name?: string };
			target?: { name?: string };
		};
		const label = `${d?.source?.name}→${d?.target?.name}`;
		if (p.classList.contains(CLASS_PAD_BAND)) {
			if (
				p.classList.contains(CLASS_CARBON_FOCUS) ||
				p.classList.contains(CLASS_STRAIGHT_FOCUS)
			) {
				padFocus = true;
			}
			continue;
		}
		if (p.classList.contains('atlas-alluvial-external-straight')) {
			if (p.classList.contains(CLASS_STRAIGHT_FOCUS)) straightFocus.push(label);
			continue;
		}
		if (p.classList.contains(CLASS_CARBON_FOCUS)) focus.push(label);
		if (p.classList.contains(CLASS_CARBON_DIM)) dim.push(label);
	}
	return { focus, dim, straightFocus, padFocus };
}

describe('focusApply MiniEl matrix', () => {
	it('D1: every non-pad carbon path + every straighten path classified focus or dim', () => {
		const holder = polishedHolder();
		const inventory = listDrawnBandsFromHolder(holder);
		// band-only main→App
		const plan = planOf(
			{
				kind: 'band',
				source: 'src/main.tsx',
				target: 'src/App.tsx',
				display: 'carbon',
			},
			['src/main.tsx', 'src/App.tsx'],
			[fileBandKey('src/main.tsx', 'src/App.tsx')],
		);
		const classes = classifyDrawnBands(plan, inventory);
		for (const b of inventory.bands) {
			const state = classes.get(b.key);
			expect(
				state === 'focus' || state === 'dim',
				`${b.key} third state`,
			).toBe(true);
		}
		// DOM apply: each non-pad carbon has exactly one of focus/dim
		applyFocusPlan(holder as unknown as HTMLElement, plan, { inventory });
		const nonPadCarbon = holder
			.querySelectorAll('path.link')
			.filter(
				(p) =>
					!p.classList.contains(CLASS_PAD_BAND) &&
					!p.classList.contains('atlas-alluvial-external-straight'),
			);
		for (const p of nonPadCarbon) {
			const f = p.classList.contains(CLASS_CARBON_FOCUS);
			const d = p.classList.contains(CLASS_CARBON_DIM);
			expect(f !== d, 'exactly one of focus|dim').toBe(true);
		}
		// straighten: focused flag only on focused key; others lack --focus
		const straights = holder.querySelectorAll(
			'path.atlas-alluvial-external-straight',
		);
		expect(straights.length).toBe(2);
		for (const p of straights) {
			// band plan focuses none of them
			expect(p.classList.contains(CLASS_STRAIGHT_FOCUS)).toBe(false);
		}
	});

	it('D2: pad-bands never focus', () => {
		const holder = polishedHolder();
		const plan = planOf(
			{ kind: 'package', name: 'react' },
			['src/main.tsx', 'react'],
			[
				externalBandKey('src/main.tsx', 'react'),
				// even if someone put the undrawn carbon key in plan - pad still never focus
				fileBandKey('src/main.tsx', 'react'),
			],
		);
		applyFocusPlan(holder as unknown as HTMLElement, plan);
		const { padFocus } = bandState(holder);
		expect(padFocus).toBe(false);
		const pad = holder
			.querySelectorAll('path.link')
			.find((p) => p.classList.contains(CLASS_PAD_BAND));
		expect(pad).toBeTruthy();
		expect(pad!.classList.contains(CLASS_CARBON_FOCUS)).toBe(false);
		expect(pad!.classList.contains(CLASS_STRAIGHT_FOCUS)).toBe(false);
	});

	it('clears inline fill-opacity with stroke-opacity so CSS focus wins', () => {
		const holder = polishedHolder();
		const carbon = holder
			.querySelectorAll('path.link')
			.find((p) => !p.classList.contains(CLASS_PAD_BAND))!;
		carbon.style.strokeOpacity = '0.8';
		carbon.style.fillOpacity = '0.8';
		const plan = planOf(
			{
				kind: 'band',
				source: 'src/main.tsx',
				target: 'src/App.tsx',
				display: 'carbon',
			},
			['src/main.tsx', 'src/App.tsx'],
			[fileBandKey('src/main.tsx', 'src/App.tsx')],
		);
		applyFocusPlan(holder as unknown as HTMLElement, plan);
		expect(carbon.style.strokeOpacity).toBeUndefined();
		expect(carbon.style.fillOpacity).toBeUndefined();
	});

	it('D3: package reverse-path plan - carbon on path focused; off-path dim', () => {
		const holder = polishedHolder();
		// reverse-path for react from main: main lit; main→App on path; main→logger off
		const plan = planOf(
			{ kind: 'package', name: 'react' },
			['src/main.tsx', 'src/App.tsx', 'react'],
			[
				fileBandKey('src/main.tsx', 'src/App.tsx'),
				externalBandKey('src/main.tsx', 'react'),
			],
		);
		applyFocusPlan(holder as unknown as HTMLElement, plan);
		const st = bandState(holder);
		expect(st.focus).toContain('src/main.tsx→src/App.tsx');
		expect(st.dim).toContain('src/main.tsx→src/lib/logger.ts');
		expect(st.straightFocus).toContain('src/main.tsx→react');
		expect(st.straightFocus).not.toContain('src/main.tsx→react-dom');
		// no blanket package class
		expect(holder.classList.contains('ui-alluvial-external-pkg-focus')).toBe(
			false,
		);
	});

	it('D4: band-only plan - exactly one non-pad band focused', () => {
		const holder = polishedHolder();
		const plan = planOf(
			{
				kind: 'band',
				source: 'src/main.tsx',
				target: 'react',
				display: 'straighten',
			},
			['src/main.tsx', 'react'],
			[externalBandKey('src/main.tsx', 'react')],
		);
		applyFocusPlan(holder as unknown as HTMLElement, plan);
		const st = bandState(holder);
		expect(st.straightFocus).toEqual(['src/main.tsx→react']);
		expect(st.focus).toEqual([]);
		// all carbon dim
		expect(st.dim.length).toBe(2);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
		// labels
		const mainG = holder
			.querySelectorAll('g.node-group')
			.find((g) => (g.__data__ as { name?: string })?.name === 'src/main.tsx');
		expect(mainG?.classList.contains(CLASS_LABEL_FOCUS)).toBe(true);
	});

	it('D5: clearFocus removes dimming classes', () => {
		const holder = polishedHolder();
		const plan = planOf(
			{ kind: 'file', name: 'src/main.tsx' },
			['src/main.tsx', 'src/App.tsx', 'react'],
			[
				fileBandKey('src/main.tsx', 'src/App.tsx'),
				externalBandKey('src/main.tsx', 'react'),
			],
		);
		applyFocusPlan(holder as unknown as HTMLElement, plan);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(true);
		clearFocusPlan(holder as unknown as HTMLElement);
		expect(holder.classList.contains(CLASS_DIMMING)).toBe(false);
		expect(holder.classList.contains('ui-alluvial-external-pkg-focus')).toBe(
			false,
		);
		for (const p of holder.querySelectorAll('path.link')) {
			expect(p.classList.contains(CLASS_CARBON_FOCUS)).toBe(false);
			expect(p.classList.contains(CLASS_CARBON_DIM)).toBe(false);
			expect(p.classList.contains(CLASS_STRAIGHT_FOCUS)).toBe(false);
		}
		for (const g of holder.querySelectorAll('g.node-group')) {
			expect(g.classList.contains(CLASS_LABEL_FOCUS)).toBe(false);
		}
	});
});
