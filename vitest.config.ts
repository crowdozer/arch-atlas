import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'@core': path.join(root, 'src/core'),
		},
	},
	test: {
		include: ['src/**/*.test.ts', 'fixtures/**/*.test.ts'],
	},
});
