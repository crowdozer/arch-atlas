// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { atlasDebugDumpPlugin } from './scripts/vite-debug-dump-plugin.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss(), atlasDebugDumpPlugin({ root })],
		resolve: {
			alias: {
				'@core': path.join(root, 'src/core'),
				'@shell': path.join(root, 'src/shell'),
				'@stage': path.join(root, 'src/stage'),
				'@exact': path.join(root, 'src/exact'),
			},
		},
		// Program enrich Web Worker (src/exact/program.worker.ts) is ESM
		worker: {
			format: 'es',
		},
		ssr: {
			noExternal: ['@carbon/icons', '@carbon/icon-helpers'],
		},
	},
});
