import { getRedis } from './redis';
import { logger } from './logger';

export async function trackPageView(name: string): Promise<void> {
	const redis = getRedis();
	await redis.incr(`pv:${name}`);
	logger.info('analytics.page', { name });
}
