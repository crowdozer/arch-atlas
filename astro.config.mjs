// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				'@core': path.join(root, 'src/core'),
				'@shell': path.join(root, 'src/shell'),
				'@stage': path.join(root, 'src/stage'),
			},
		},
		ssr: {
			noExternal: ['@carbon/icons', '@carbon/icon-helpers'],
		},
	},
});
