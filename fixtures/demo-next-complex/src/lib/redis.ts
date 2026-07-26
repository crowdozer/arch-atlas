import Redis from 'ioredis';
import { logger } from './logger';

let client: Redis | null = null;

export function getRedis(): Redis {
	if (!client) {
		client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
		logger.info('redis.connect');
	}
	return client;
}
