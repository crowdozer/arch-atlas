import { fetchUser } from '../api/users';
import type { User } from '../domain/user';
import { anonymousUser } from '../domain/user';
import { FEATURE_FLAGS } from '../utils/config';

let session: User | null = null;

export async function login(id: string): Promise<User> {
	session = await fetchUser(id);
	return session;
}

export function currentUser(): User {
	return session ?? anonymousUser();
}

export function requiresAuth(): boolean {
	return FEATURE_FLAGS.godHubRouting;
}
