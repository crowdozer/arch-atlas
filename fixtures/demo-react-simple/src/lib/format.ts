import type { User } from '../types';

export function formatName(user: User): string {
	return user.name.trim() || user.email;
}

export function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}
