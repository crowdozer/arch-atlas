import type { User } from '../types';

export function formatUser(u: User): string {
	return `${u.id}:${u.name}`;
}
