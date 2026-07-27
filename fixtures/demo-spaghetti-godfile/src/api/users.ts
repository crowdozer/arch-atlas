import type { User } from '../domain/user';
import { anonymousUser } from '../domain/user';
import { API_BASE } from '../utils/config';
import { branded } from '../utils/helpers';

const cache = new Map<string, User>();

export async function fetchUser(id: string): Promise<User> {
	if (cache.has(id)) return cache.get(id)!;
	console.log(branded(`GET ${API_BASE}/users/${id}`));
	const u = { id, email: `${id}@example.com`, name: id };
	cache.set(id, u);
	return u;
}

export async function fetchUsers(): Promise<User[]> {
	return [anonymousUser(), await fetchUser('u1'), await fetchUser('u2')];
}
