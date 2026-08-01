/**
 * Serve built site for focus e2e via `astro preview` on an **ephemeral port**.
 *
 * Does **not** use or stop a human `astro dev` on :4321 - that may be a clean
 * main checkout without /focus-e2e or without the focus fix. E2E always builds
 * this worktree’s dist/ when needed and previews in isolation.
 *
 * Phase 3: build is **fail-closed on freshness** (content hash of focus/stage
 * sources) - stale dist cannot green a broken binding.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AstroDevServer = {
	baseUrl: string;
	stop(): Promise<void>;
};

const STAMP_NAME = '.focus-e2e-build-stamp';

/** Minimum Node from package.json engines (fail closed in e2e). */
export function assertNodeEngines(min = '22.12.0'): void {
	const [maj, minN, pat] = min.split('.').map((x) => Number(x));
	const cur = process.versions.node.split('.').map((x) => Number(x));
	const ok =
		cur[0]! > maj! ||
		(cur[0] === maj && cur[1]! > minN!) ||
		(cur[0] === maj && cur[1] === minN && cur[2]! >= (pat ?? 0));
	if (!ok) {
		throw new Error(
			`test:e2e:focus requires Node >=${min} (got ${process.versions.node}). ` +
				`See package.json engines.`,
		);
	}
}

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

function walkFiles(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) walkFiles(full, out);
		else out.push(full);
	}
	return out;
}

/**
 * Hash sources that affect focus-e2e paint/binding. Any change forces rebuild.
 */
export function focusE2ESourceHash(repoRoot: string): string {
	const roots = [
		path.join(repoRoot, 'src/stage/focus'),
		path.join(repoRoot, 'src/stage/polish'),
		path.join(repoRoot, 'src/stage/mount.ts'),
		path.join(repoRoot, 'src/stage/carbonEvents.ts'),
		path.join(repoRoot, 'src/pages/focus-e2e.astro'),
		path.join(repoRoot, 'package.json'),
		path.join(repoRoot, 'astro.config.mjs'),
	];
	const h = createHash('sha256');
	const files: string[] = [];
	for (const r of roots) {
		if (!existsSync(r)) continue;
		const st = statSync(r);
		if (st.isDirectory()) walkFiles(r, files);
		else files.push(r);
	}
	files.sort();
	for (const f of files) {
		const rel = path.relative(repoRoot, f);
		h.update(rel);
		h.update('\0');
		h.update(readFileSync(f));
		h.update('\0');
	}
	return h.digest('hex');
}

/**
 * Fail-closed build: rebuild when dist missing, stamp missing, or hash mismatch.
 * Set ATLAS_E2E_SKIP_BUILD=1 only for local emergency (not CI).
 */
export function ensureFocusE2EBuild(repoRoot: string): void {
	if (process.env.ATLAS_E2E_SKIP_BUILD === '1') {
		const page = path.join(repoRoot, 'dist/focus-e2e/index.html');
		if (!existsSync(page)) {
			throw new Error(
				'ATLAS_E2E_SKIP_BUILD=1 but dist/focus-e2e missing - cannot skip',
			);
		}
		return;
	}

	const page = path.join(repoRoot, 'dist/focus-e2e/index.html');
	const stampPath = path.join(repoRoot, 'dist', STAMP_NAME);
	const hash = focusE2ESourceHash(repoRoot);
	const stampOk =
		existsSync(page) &&
		existsSync(stampPath) &&
		readFileSync(stampPath, 'utf8').trim() === hash;

	if (stampOk && process.env.ATLAS_E2E_FORCE_BUILD !== '1') {
		return;
	}

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
	writeFileSync(stampPath, `${hash}\n`, 'utf8');
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
				(output.includes(`Local`) && output.includes(String(port)))
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
 * Build (fail-closed freshness) + `astro preview` on ephemeral port.
 */
export async function startAstroDevServer(
	timeoutMs = 120_000,
): Promise<AstroDevServer> {
	assertNodeEngines('22.12.0');
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
