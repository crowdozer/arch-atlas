import type { User } from '../../types/user';

export function DashboardNav({ user }: { user: User | null }) {
	return (
		<nav>
			<a href="/dashboard">Overview</a>
			<a href="/dashboard/settings">Settings</a>
			<span>{user?.name ?? 'Unknown'}</span>
		</nav>
	);
}
