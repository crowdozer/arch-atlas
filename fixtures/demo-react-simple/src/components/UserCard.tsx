import type { User } from '../types';
import { formatName } from '../lib/format';

export function UserCard({ user }: { user: User }) {
	return (
		<article>
			<h2>{formatName(user)}</h2>
			<p>{user.email}</p>
		</article>
	);
}
