import { getUserById } from '../db/users';
import { getRedis } from '../redis';
import { logger } from '../logger';
import type { Session } from '../../types/session';

export function getTokenFromCookie(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
	return match?.[1] ?? null;
}

export async function getServerSession(): Promise<Session | null> {
	// Demo: pretend cookie / env session
	const userId = process.env.DEMO_USER_ID ?? 'user_1';
	const user = await getUserById(userId);
	if (!user) return null;
	return {
		userId: user.id,
		email: user.email,
		stripeCustomerId: user.stripeCustomerId ?? 'cus_demo',
	};
}

export async function requireSession(): Promise<Session> {
	const session = await getServerSession();
	if (!session) {
		logger.error('auth.unauthorized');
		throw new Error('Unauthorized');
	}
	const redis = getRedis();
	await redis.setex(`sess:${session.userId}`, 3600, '1');
	return session;
}
