import type { ReactNode } from 'react';
import { DashboardNav } from '../../src/components/layout/DashboardNav';
import { requireSession } from '../../src/lib/auth/session';
import { getUserById } from '../../src/lib/db/users';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
	const session = await requireSession();
	// Layer violation demo: layout reaches into DB
	const user = await getUserById(session.userId);
	return (
		<div className="dashboard">
			<DashboardNav user={user} />
			{children}
		</div>
	);
}
