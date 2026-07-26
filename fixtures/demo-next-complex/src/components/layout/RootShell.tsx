import type { ReactNode } from 'react';
import type { Session } from '../../types/session';
import { SiteHeader } from './SiteHeader';

export function RootShell({
	session,
	children,
}: {
	session: Session | null;
	children: ReactNode;
}) {
	return (
		<div className="shell">
			<SiteHeader session={session} />
			<main>{children}</main>
		</div>
	);
}
