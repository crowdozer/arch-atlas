export type User = { id: string; email: string; name: string };

export function anonymousUser(): User {
	return { id: 'anon', email: '', name: 'Guest' };
}

export function displayName(u: User): string {
	return u.name || u.email || u.id;
}
