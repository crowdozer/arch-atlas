import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '../../../src/lib/db/client';
import { getRedis } from '../../../src/lib/redis';
import { logger } from '../../../src/lib/logger';

/** Leftover Pages Router route — still imported by ops tooling. */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
	const redis = getRedis();
	try {
		const db = await query<{ ok: number }>('select 1 as ok');
		const pong = await redis.ping();
		logger.info('legacy.health', { db: db[0]?.ok, redis: pong });
		res.status(200).json({ ok: true, db: db[0]?.ok === 1, redis: pong === 'PONG' });
	} catch (err) {
		logger.error('legacy.health_failed', err);
		res.status(500).json({ ok: false });
	}
}
