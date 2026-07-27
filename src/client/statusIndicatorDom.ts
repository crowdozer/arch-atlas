/**
 * DOM atom for status indicators (Carbon icon glyphs + ui-status-indicator CSS).
 * Pure presentation lives in `@shell/statusIndicator`; this module only paints.
 */
import { toString } from '@carbon/icon-helpers';
import CircleSolid16 from '@carbon/icons/es/circle--solid/16.js';
import CircleOutline16 from '@carbon/icons/es/circle--outline/16.js';
import Incomplete16 from '@carbon/icons/es/incomplete/16.js';
import Critical16 from '@carbon/icons/es/critical/index.js';
import TriangleSolid16 from '@carbon/icons/es/triangle--solid/16.js';
import TriangleOutline16 from '@carbon/icons/es/triangle--outline/16.js';
import DiamondSolid16 from '@carbon/icons/es/diamond--solid/16.js';
import DiamondOutline16 from '@carbon/icons/es/diamond--outline/16.js';
import SquareSolid16 from '@carbon/icons/es/square--solid/16.js';
import SquareOutline16 from '@carbon/icons/es/square--outline/16.js';
import {
	statusColorCssVar,
	type StatusPresentation,
} from '@shell/statusIndicator.ts';

/** Minimal descriptor shape emitted by @carbon/icons modules. */
type IconDescriptor = {
	elem?: string;
	attrs?: Record<string, string | number | undefined>;
	content?: IconDescriptor[];
	name?: string;
	size?: number;
};

function iconSvg(descriptor: IconDescriptor): string {
	return toString(descriptor as Parameters<typeof toString>[0]);
}

function pickIcon(p: StatusPresentation): IconDescriptor {
	const solid = p.variant === 'solid';
	switch (p.shape) {
		case 'circle':
			return (solid ? CircleSolid16 : CircleOutline16) as IconDescriptor;
		case 'circle-half':
			return Incomplete16 as IconDescriptor;
		case 'circle-slash':
			return Critical16 as IconDescriptor;
		case 'triangle':
			return (solid ? TriangleSolid16 : TriangleOutline16) as IconDescriptor;
		case 'diamond':
			return (solid ? DiamondSolid16 : DiamondOutline16) as IconDescriptor;
		case 'square':
			return (solid ? SquareSolid16 : SquareOutline16) as IconDescriptor;
	}
}

export type StatusIndicatorDomOpts = {
	/** xs = 10px dense subbar; sm = 16px. */
	size?: 'xs' | 'sm' | 'md';
	/** When false, shape only (title/aria-label carry the name). */
	showLabel?: boolean;
	className?: string;
};

/**
 * Build a status indicator element (icon-only by default for dense chips).
 */
export function createStatusIndicatorEl(
	status: StatusPresentation,
	opts: StatusIndicatorDomOpts = {},
): HTMLElement {
	const size = opts.size ?? 'xs';
	const showLabel = opts.showLabel ?? false;
	const root = document.createElement('span');
	root.className = [
		'ui-status-indicator',
		`ui-status-indicator--${size}`,
		opts.className ?? '',
	]
		.filter(Boolean)
		.join(' ');
	root.style.setProperty('--ui-status-color', statusColorCssVar(status.color));

	const title = status.title ?? status.label;
	root.title = title;
	if (!showLabel) {
		root.setAttribute('role', 'img');
		root.setAttribute('aria-label', status.title ?? status.label);
	}

	const shape = document.createElement('span');
	shape.className = 'ui-status-indicator__shape';
	shape.setAttribute('aria-hidden', 'true');
	shape.innerHTML = iconSvg(pickIcon(status));
	// Mark SVG for CSS sizing
	const svg = shape.querySelector('svg');
	if (svg) svg.classList.add('ui-status-indicator__svg');
	root.appendChild(shape);

	if (showLabel) {
		const label = document.createElement('span');
		label.className = 'ui-status-indicator__label';
		label.textContent = status.label;
		root.appendChild(label);
	}

	return root;
}
