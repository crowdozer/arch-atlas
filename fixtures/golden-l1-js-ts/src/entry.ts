/** L1 entry - relative, package, type-only, worker query. */
import { util } from './lib/util';
import type { UtilResult } from './lib/util';
import { z } from 'zod';
import WorkerCtor from './lib/worker-target.ts?worker';

export function boot(): UtilResult {
	const _w = WorkerCtor;
	void _w;
	return util(z.string().parse('ok'));
}
