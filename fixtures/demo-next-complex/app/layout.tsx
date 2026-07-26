import type { ReactNode } from 'react';
import { RootShell } from '../src/components/layout/RootShell';
import { getServerSession } from '../src/lib/auth/session';
import { logger } from '../src/lib/logger';

export default async function RootLayout({ children }: { children: ReactNode }) {
	const session = await getServerSession();
	logger.info('layout.render', { userId: session?.userId ?? null });
	return (
		<html lang="en">
			<body>
				<RootShell session={session}>{children}</RootShell>
			</body>
		</html>
	);
}
