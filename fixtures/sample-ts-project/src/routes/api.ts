import { formatUser } from '../lib/format';
import type { User } from '../types';

export function handleRequest(
	req: { path: string },
	users: User[],
): { status: number; body: string } {
	if (req.path === '/users') {
		return { status: 200, body: users.map(formatUser).join('\n') };
	}
	return { status: 404, body: 'not found' };
}
