import {
	getUserById,
	insertUser,
	listAllUsers,
	updateUserName,
} from '../lib/db/users';
import { sendEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import type { User, UserCreate } from '../types/user';
import { assertFound } from '../lib/http/errors';
import { trackPageView } from '../lib/analytics';

export async function listUsers(): Promise<User[]> {
	const redis = getRedis();
	const cached = await redis.get('users:all');
	if (cached) return JSON.parse(cached) as User[];
	const users = await listAllUsers();
	await redis.setex('users:all', 30, JSON.stringify(users));
	return users;
}

export async function createUser(input: UserCreate, actorId: string): Promise<User> {
	const user = await insertUser(input, actorId);
	await sendEmail(user.email, 'Welcome', `Hello ${user.name}`);
	await getRedis().del('users:all');
	logger.info('userService.create', { id: user.id, actorId });
	return user;
}

export async function updateProfile(
	userId: string,
	patch: { name: string },
): Promise<User> {
	const existing = assertFound(await getUserById(userId));
	const updated = await updateUserName(existing.id, patch.name);
	// Spaghetti: analytics from user service
	await trackPageView(`profile_update:${userId}`);
	return updated;
}
