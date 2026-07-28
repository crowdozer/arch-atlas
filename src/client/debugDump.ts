/**
 * Dev-only alluvial debug dump: payload + Carbon layout + host controls.
 * POSTs to Vite middleware `/api/debug/alluvial-dump` (writes `.atlas-debug/`).
 * Outside dev the endpoint 500s / is absent — button is not mounted in prod HTML.
 */

import type { AlluvialPayload } from '@core/graph/types.ts';
import type { BandSortMode, LocPrecision, WeightAxis } from '@core/index.ts';
import type { AtlasView, InteractionMode } from '@shell/index.ts';
import { dumpCarbonRender, type CarbonRenderDump } from '@stage/debugCarbonDump.ts';
import { setStatus } from './dom.ts';

export const DEBUG_DUMP_SCHEMA = 'arch-atlas.debug-alluvial.v1' as const;

export type HostDebugSlice = {
	viewStack: AtlasView[];
	currentView: AtlasView | null;
	weightAxis: WeightAxis;
	bandSort: BandSortMode;
	locPrecision: LocPrecision;
	vizMaxDepth: number;
	interactionMode: InteractionMode;
	includeTests: boolean;
	pendingPackageFocusLabel: string | null;
	programExactMass: boolean;
	engineFailed: boolean;
	/** Optional freeform note from the user (agent context). */
	userNote?: string;
};

export type AlluvialDebugDump = {
	schema: typeof DEBUG_DUMP_SCHEMA;
	capturedAt: string;
	/** How agents should treat this file */
	agentHint: string;
	host: HostDebugSlice;
	/** Projection SoR: links, nodes, ranks, terminators, nodeRef (no raw source). */
	payload: {
		null: boolean;
		data: AlluvialPayload['data'] | null;
		units?: string;
		nodeAlignment?: string;
		nodes: AlluvialPayload['options']['alluvial']['nodes'] | null;
		meta: AlluvialPayload['meta'] | null;
		colorScaleKeys: string[];
	} | null;
	/** Post-layout Carbon/d3 geometry + focus classes */
	carbon: CarbonRenderDump | null;
	extra: {
		href: string;
		userAgent: string;
		viewport: { w: number; h: number };
	};
};

export function buildAlluvialDebugDump(args: {
	payload: AlluvialPayload | null;
	holder: HTMLElement | null;
	host: HostDebugSlice;
}): AlluvialDebugDump {
	const payload = args.payload;
	return {
		schema: DEBUG_DUMP_SCHEMA,
		capturedAt: new Date().toISOString(),
		agentHint:
			'Dev dump for analysis. payload = projection (links/nodes/meta.nodeRank). carbon = post-polish DOM geometry. host = session controls. No raw source files.',
		host: args.host,
		payload: payload
			? {
					null: false,
					data: payload.data,
					units: payload.options?.alluvial?.units,
					nodeAlignment: payload.options?.alluvial?.nodeAlignment,
					nodes: payload.options?.alluvial?.nodes ?? null,
					meta: payload.meta ?? null,
					colorScaleKeys: Object.keys(payload.options?.color?.scale ?? {}),
				}
			: { null: true, data: null, nodes: null, meta: null, colorScaleKeys: [] },
		carbon: dumpCarbonRender(args.holder),
		extra: {
			href: typeof location !== 'undefined' ? location.href : '',
			userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
			viewport:
				typeof window !== 'undefined'
					? { w: window.innerWidth, h: window.innerHeight }
					: { w: 0, h: 0 },
		},
	};
}

export type DebugDumpPostResult =
	| { ok: true; path: string; latestPath: string; bytes: number }
	| { ok: false; error: string; status?: number };

/**
 * POST dump to dev middleware. Fails closed outside dev.
 */
export async function postAlluvialDebugDump(
	dump: AlluvialDebugDump,
): Promise<DebugDumpPostResult> {
	try {
		const res = await fetch('/api/debug/alluvial-dump', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(dump),
		});
		const text = await res.text();
		let body: unknown = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = { raw: text.slice(0, 200) };
		}
		if (!res.ok) {
			const err =
				body && typeof body === 'object' && body !== null && 'error' in body
					? String((body as { error: unknown }).error)
					: `HTTP ${res.status}`;
			return { ok: false, error: err, status: res.status };
		}
		const b = body as {
			path?: string;
			latestPath?: string;
			bytes?: number;
		};
		return {
			ok: true,
			path: b.path ?? '.atlas-debug/alluvial-latest.json',
			latestPath: b.latestPath ?? b.path ?? '.atlas-debug/alluvial-latest.json',
			bytes: typeof b.bytes === 'number' ? b.bytes : 0,
		};
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/** Also copy JSON to clipboard when possible (handy for pasting into chat). */
export async function copyJsonToClipboard(obj: unknown): Promise<boolean> {
	try {
		const text = JSON.stringify(obj, null, 2);
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * Build dump, POST to disk endpoint, optional clipboard. Updates status line.
 */
export async function runAlluvialDebugDump(args: {
	payload: AlluvialPayload | null;
	holder: HTMLElement | null;
	host: HostDebugSlice;
}): Promise<void> {
	const dump = buildAlluvialDebugDump(args);
	const posted = await postAlluvialDebugDump(dump);
	const copied = await copyJsonToClipboard(dump);
	if (posted.ok) {
		setStatus(
			`Debug dump → ${posted.latestPath} (${posted.bytes} B)` +
				(copied ? ' · clipboard' : ''),
		);
		console.info('[atlas debug dump]', posted.path, dump);
	} else {
		setStatus(`Debug dump failed: ${posted.error}`);
		console.warn('[atlas debug dump]', posted, dump);
	}
}
