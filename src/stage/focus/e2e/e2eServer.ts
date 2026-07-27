/**
 * Serve built site for focus e2e via `astro preview` on an **ephemeral port**.
 *
 * Does **not** use or stop a human `astro dev` on :4321 — that may be a clean
 * main checkout without /focus-e2e or without the focus fix. E2E always builds
 * this worktree’s dist/ when needed and previews in isolation.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AstroDevServer = {
	baseUrl: string;
	stop(): Promise<void>;
};

function resolveRepoRoot(): string {
	const cwd = process.cwd();
	if (existsSync(path.join(cwd, 'src/pages/focus-e2e.astro'))) return cwd;
	const fromUrl = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../..',
	);
	if (existsSync(path.join(fromUrl, 'src/pages/focus-e2e.astro'))) {
		return fromUrl;
	}
	throw new Error(
		`Cannot find focus-e2e.astro from cwd=${cwd} or ${fromUrl}`,
	);
}

async function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				reject(new Error('Could not resolve ephemeral port'));
				return;
			}
			const { port } = address;
			server.close((error) => {
				if (error) reject(error);
				else resolve(port);
			});
		});
	});
}

export function ensureFocusE2EBuild(repoRoot: string): void {
	const page = path.join(repoRoot, 'dist/focus-e2e/index.html');
	if (existsSync(page)) return;
	const r = spawnSync('npm', ['run', 'build'], {
		cwd: repoRoot,
		stdio: 'inherit',
		env: { ...process.env, NO_COLOR: '1' },
	});
	if (r.status !== 0) {
		throw new Error(`npm run build failed (status ${r.status})`);
	}
	if (!existsSync(page)) {
		throw new Error(`build completed but missing ${page}`);
	}
}

function waitForPreviewReady(
	proc: ChildProcess,
	port: number,
	timeoutMs: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;
		let output = '';

		const onData = (chunk: Buffer | string) => {
			output += chunk.toString();
			if (
				output.includes(`localhost:${port}`) ||
				output.includes(`127.0.0.1:${port}`) ||
				output.includes(`Local`) && output.includes(String(port))
			) {
				cleanup();
				resolve();
			}
		};

		const onExit = (code: number | null) => {
			cleanup();
			reject(
				new Error(
					`astro preview exited before ready (code ${code ?? 'null'})\n${output}`,
				),
			);
		};

		const timer = setInterval(() => {
			if (Date.now() > deadline) {
				cleanup();
				reject(
					new Error(
						`Timed out waiting for astro preview on port ${port}\n${output}`,
					),
				);
			}
		}, 250);

		const cleanup = () => {
			clearInterval(timer);
			proc.stdout?.off('data', onData);
			proc.stderr?.off('data', onData);
			proc.off('exit', onExit);
		};

		proc.stdout?.on('data', onData);
		proc.stderr?.on('data', onData);
		proc.on('exit', onExit);
	});
}

async function waitForOk(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let last = '';
	while (Date.now() < deadline) {
		try {
			const r = await fetch(url, { signal: AbortSignal.timeout(3_000) });
			if (r.ok) return;
			last = `status ${r.status}`;
		} catch (e) {
			last = String(e);
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`URL not ok: ${url} (${last})`);
}

/**
 * Build (if needed) + `astro preview` on ephemeral port.
 */
export async function startAstroDevServer(
	timeoutMs = 120_000,
): Promise<AstroDevServer> {
	const repoRoot = resolveRepoRoot();
	ensureFocusE2EBuild(repoRoot);

	const port = await findFreePort();
	const proc = spawn(
		'npx',
		['astro', 'preview', '--host', '127.0.0.1', '--port', String(port)],
		{
			cwd: repoRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, NO_COLOR: '1' },
		},
	);

	await waitForPreviewReady(proc, port, timeoutMs);
	const baseUrl = `http://127.0.0.1:${port}`;
	// Static export uses trailing directory
	await waitForOk(`${baseUrl}/focus-e2e/`, 30_000);

	return {
		baseUrl,
		stop: async () => {
			if (proc.pid) {
				try {
					process.kill(proc.pid, 'SIGTERM');
				} catch {
					/* gone */
				}
			}
		},
	};
}
