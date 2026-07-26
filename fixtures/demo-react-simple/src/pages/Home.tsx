import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { UserCard } from '../components/UserCard';
import { fetchUsers } from '../lib/api';
import type { User } from '../types';

export function HomePage() {
	const [users, setUsers] = useState<User[]>([]);

	useEffect(() => {
		void fetchUsers().then(setUsers);
	}, []);

	return (
		<section>
			<h1>Home</h1>
			<Button label="Refresh" onClick={() => void fetchUsers().then(setUsers)} />
			<ul>
				{users.map((u) => (
					<li key={u.id}>
						<UserCard user={u} />
					</li>
				))}
			</ul>
		</section>
	);
}
