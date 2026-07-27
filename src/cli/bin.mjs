#!/usr/bin/env node
/**
 * package.json bin shim: spawn tsx on main.ts so @core path aliases resolve.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let tsxCli;
try {
	tsxCli = require.resolve('tsx/cli');
} catch {
	console.error(
		'arch-atlas: missing dependency "tsx". Run `npm install` in the package root.',
	);
	process.exit(1);
}

const mainTs = path.join(__dirname, 'main.ts');
const child = spawn(
	process.execPath,
	[tsxCli, mainTs, ...process.argv.slice(2)],
	{ stdio: 'inherit', env: process.env },
);

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});

child.on('error', (err) => {
	console.error(`arch-atlas: failed to start: ${err.message}`);
	process.exit(1);
});
