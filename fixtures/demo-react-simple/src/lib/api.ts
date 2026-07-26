import { z } from 'zod';
import { logger } from './logger';
import type { User } from '../types';
import { UserSchema } from '../types';

const UsersSchema = z.array(UserSchema);

export async function fetchUsers(): Promise<User[]> {
	logger.info('fetchUsers');
	// Demo stub — not a real network call
	const raw = [
		{ id: '1', name: 'Ada', email: 'ada@example.com' },
		{ id: '2', name: 'Grace', email: 'grace@example.com' },
	];
	return UsersSchema.parse(raw);
}

export async function fetchUser(id: string): Promise<User | null> {
	const users = await fetchUsers();
	return users.find((u) => u.id === id || id === 'me') ?? null;
}
