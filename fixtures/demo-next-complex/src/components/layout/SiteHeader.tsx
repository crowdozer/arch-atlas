import type { Session } from '../../types/session';
import { slugify } from '../../utils/legacyHelpers';

export function SiteHeader({ session }: { session: Session | null }) {
	return (
		<header>
			<a href="/">Home</a>
			<a href="/pricing">Pricing</a>
			<a href="/dashboard">Dashboard</a>
			{session ? (
				<span data-user={slugify(session.email)}>{session.email}</span>
			) : (
				<a href="/api/auth/signin">Sign in</a>
			)}
		</header>
	);
}
