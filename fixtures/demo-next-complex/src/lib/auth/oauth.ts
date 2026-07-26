import { logger } from '../logger';
import { insertUser } from '../db/users';
import { getRedis } from '../redis';

/** Simulated OAuth bootstrap used by legacy admin scripts. */
export async function upsertOauthUser(profile: {
	email: string;
	name: string;
	provider: string;
}) {
	logger.info('oauth.upsert', profile);
	const redis = getRedis();
	const cached = await redis.get(`oauth:${profile.provider}:${profile.email}`);
	if (cached) return JSON.parse(cached);
	const user = await insertUser(
		{ email: profile.email, name: profile.name },
		'system:oauth',
	);
	await redis.setex(`oauth:${profile.provider}:${profile.email}`, 86400, JSON.stringify(user));
	return user;
}
