import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'@core': path.join(root, 'src/core'),
			'@shell': path.join(root, 'src/shell'),
			'@stage': path.join(root, 'src/stage'),
			'@exact': path.join(root, 'src/exact'),
		},
	},
	test: {
		include: ['src/**/*.test.ts', 'fixtures/**/*.test.ts'],
		// Browser Carbon e2e: npm run test:e2e:focus only (needs preview + playwright)
		exclude: ['src/**/*.e2e.test.ts', '**/node_modules/**'],
	},
});

