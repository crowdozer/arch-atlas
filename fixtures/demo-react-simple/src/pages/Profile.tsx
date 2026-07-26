import { useUser } from '../hooks/useUser';
import { UserCard } from '../components/UserCard';
import { Button } from '../components/Button';

export function ProfilePage() {
	const { user, loading, reload } = useUser('me');

	if (loading) return <p>Loading…</p>;
	if (!user) return <p>No profile</p>;

	return (
		<section>
			<h1>Profile</h1>
			<UserCard user={user} />
			<Button label="Reload" variant="ghost" onClick={() => void reload()} />
		</section>
	);
}
