/** Framework-ish start candidate */
import { formatUser } from '@/lib/format';
import type { User } from '@/types';

export function renderHome(users: User[]) {
	return users.map(formatUser).join(', ');
}
