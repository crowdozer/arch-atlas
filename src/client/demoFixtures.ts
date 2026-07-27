/**
 * Built-in demo repos (fixtures on disk, bundled via Vite raw import).
 * Buttons on the upload step load these as VirtualFile[] — no ZIP required.
 */
import type { VirtualFile } from '@core/graph/types.ts';

export type DemoId = 'react-simple' | 'next-complex' | 'spaghetti-godfile';

export type DemoMeta = {
	id: DemoId;
	title: string;
	blurb: string;
	complexity: 'low' | 'high';
};

export const DEMO_OPTIONS: DemoMeta[] = [
	{
		id: 'react-simple',
		title: 'React (low complexity)',
		blurb: 'Vite + React Router toy app — clean pages → hooks → api layers.',
		complexity: 'low',
	},
	{
		id: 'next-complex',
		title: 'Next.js (high complexity)',
		blurb: 'App Router + API + legacy pages, services, DB, Stripe, spaghetti edges.',
		complexity: 'high',
	},
	{
		id: 'spaghetti-godfile',
		title: 'Spaghetti hub (godfile demo)',
		blurb: 'Cross-domain hub with high fan-in/out and reverse blast chains.',
		complexity: 'high',
	},
];

const reactModules = import.meta.glob('../../fixtures/demo-react-simple/**/*', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const nextModules = import.meta.glob('../../fixtures/demo-next-complex/**/*', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const spaghettiModules = import.meta.glob(
	'../../fixtures/demo-spaghetti-godfile/**/*',
	{
		query: '?raw',
		import: 'default',
		eager: true,
	},
) as Record<string, string>;

const GLOBS: Record<DemoId, { modules: Record<string, string>; marker: string }> = {
	'react-simple': {
		modules: reactModules,
		marker: 'fixtures/demo-react-simple/',
	},
	'next-complex': {
		modules: nextModules,
		marker: 'fixtures/demo-next-complex/',
	},
	'spaghetti-godfile': {
		modules: spaghettiModules,
		marker: 'fixtures/demo-spaghetti-godfile/',
	},
};

function toVirtualFiles(
	modules: Record<string, string>,
	marker: string,
): VirtualFile[] {
	const encoder = new TextEncoder();
	const files: VirtualFile[] = [];
	for (const [key, content] of Object.entries(modules)) {
		const normalizedKey = key.replace(/\\/g, '/');
		const idx = normalizedKey.lastIndexOf(marker);
		if (idx < 0) continue;
		const path = normalizedKey.slice(idx + marker.length);
		if (!path || path.endsWith('/')) continue;
		// skip empty placeholder paths
		if (typeof content !== 'string') continue;
		files.push({
			path,
			content,
			byteLength: encoder.encode(content).length,
		});
	}
	files.sort((a, b) => a.path.localeCompare(b.path));
	return files;
}

/** Load a demo fixture as virtual files (same shape as ZIP ingest). */
export function loadDemoFiles(id: DemoId): VirtualFile[] {
	const entry = GLOBS[id];
	if (!entry) throw new Error(`Unknown demo: ${id}`);
	const files = toVirtualFiles(entry.modules, entry.marker);
	if (!files.length) {
		throw new Error(`Demo "${id}" produced zero files — check fixture paths / glob.`);
	}
	return files;
}
