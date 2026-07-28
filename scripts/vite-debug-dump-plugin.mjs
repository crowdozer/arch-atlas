/**
 * Vite/Astro dev-only middleware: POST /api/debug/alluvial-dump → .atlas-debug/
 * Production build: not registered. If ever hit outside dev, respond 500.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = '/api/debug/alluvial-dump';
const MAX_BODY = 25 * 1024 * 1024; // 25 MiB

/**
 * @param {{ root: string }} opts
 * @returns {import('vite').Plugin}
 */
export function atlasDebugDumpPlugin(opts) {
	const root = opts.root;
	const outDir = path.join(root, '.atlas-debug');

	return {
		name: 'atlas-debug-alluvial-dump',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = req.url?.split('?')[0] ?? '';
				if (url !== ROUTE) {
					next();
					return;
				}

				// Vite configureServer is always dev — still fail closed if miswired
				if (process.env.NODE_ENV === 'production') {
					res.statusCode = 500;
					res.setHeader('Content-Type', 'application/json');
					res.end(
						JSON.stringify({
							ok: false,
							error: 'debug dump only available in astro/vite dev',
						}),
					);
					return;
				}

				if (req.method === 'GET' || req.method === 'HEAD') {
					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json');
					res.end(
						JSON.stringify({
							ok: true,
							route: ROUTE,
							dir: '.atlas-debug',
							hint: 'POST JSON body (arch-atlas.debug-alluvial.v1)',
						}),
					);
					return;
				}

				if (req.method !== 'POST') {
					res.statusCode = 405;
					res.setHeader('Allow', 'GET, POST');
					res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
					return;
				}

				try {
					const chunks = [];
					let size = 0;
					for await (const chunk of req) {
						size += chunk.length;
						if (size > MAX_BODY) {
							res.statusCode = 413;
							res.end(JSON.stringify({ ok: false, error: 'body too large' }));
							return;
						}
						chunks.push(chunk);
					}
					const raw = Buffer.concat(chunks).toString('utf8');
					let body;
					try {
						body = JSON.parse(raw);
					} catch {
						res.statusCode = 400;
						res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
						return;
					}

					if (
						!body ||
						typeof body !== 'object' ||
						body.schema !== 'arch-atlas.debug-alluvial.v1'
					) {
						res.statusCode = 400;
						res.end(
							JSON.stringify({
								ok: false,
								error: 'expected schema arch-atlas.debug-alluvial.v1',
							}),
						);
						return;
					}

					fs.mkdirSync(outDir, { recursive: true });
					const stamp = new Date()
						.toISOString()
						.replace(/[:.]/g, '-')
						.replace('T', '_')
						.replace('Z', '');
					const stamped = path.join(outDir, `alluvial-${stamp}.json`);
					const latest = path.join(outDir, 'alluvial-latest.json');
					const pretty = JSON.stringify(body, null, 2);
					fs.writeFileSync(stamped, pretty, 'utf8');
					fs.writeFileSync(latest, pretty, 'utf8');

					// Tiny index for agents
					const indexPath = path.join(outDir, 'README.txt');
					fs.writeFileSync(
						indexPath,
						[
							'Arch Atlas alluvial debug dumps (gitignored).',
							'',
							'alluvial-latest.json  — most recent dump (overwrite each click)',
							'alluvial-<stamp>.json — timestamped copies',
							'',
							'Schema: arch-atlas.debug-alluvial.v1',
							'POST /api/debug/alluvial-dump (astro dev only; 500 outside dev)',
							'',
						].join('\n'),
						'utf8',
					);

					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json');
					res.end(
						JSON.stringify({
							ok: true,
							path: path.relative(root, stamped),
							latestPath: path.relative(root, latest),
							bytes: Buffer.byteLength(pretty, 'utf8'),
						}),
					);
				} catch (err) {
					res.statusCode = 500;
					res.setHeader('Content-Type', 'application/json');
					res.end(
						JSON.stringify({
							ok: false,
							error: err instanceof Error ? err.message : String(err),
						}),
					);
				}
			});
		},
	};
}
