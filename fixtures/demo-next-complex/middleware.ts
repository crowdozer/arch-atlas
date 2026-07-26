import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTokenFromCookie } from './src/lib/auth/session';
import { logger } from './src/lib/logger';

export function middleware(req: NextRequest) {
	const token = getTokenFromCookie(req.headers.get('cookie'));
	if (req.nextUrl.pathname.startsWith('/dashboard') && !token) {
		logger.info('middleware.auth_redirect', { path: req.nextUrl.pathname });
		return NextResponse.redirect(new URL('/api/auth/signin', req.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ['/dashboard/:path*', '/api/orders/:path*'],
};
