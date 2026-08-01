import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Browser e2e for hub focus (Carbon mount + polish + apply).
 * Not part of `npm test` - run via `npm run test:e2e:focus`.
 * Pattern: mainframe artillery `vitest.e2e.config.ts`.
 */
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
		include: ['src/stage/focus/e2e/**/*.e2e.test.ts'],
		testTimeout: 600_000,
		hookTimeout: 180_000,
		fileParallelism: false,
	},
});
