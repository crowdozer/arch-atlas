import { NextResponse } from 'next/server';
import { listUsers, createUser } from '../../../src/services/userService';
import { requireSession } from '../../../src/lib/auth/session';
import { logger } from '../../../src/lib/logger';
import { UserCreateSchema } from '../../../src/types/user';

export async function GET() {
	const session = await requireSession();
	logger.info('api.users.list', { by: session.userId });
	const users = await listUsers();
	return NextResponse.json({ users });
}

export async function POST(req: Request) {
	const session = await requireSession();
	const body = UserCreateSchema.parse(await req.json());
	const user = await createUser(body, session.userId);
	return NextResponse.json({ user }, { status: 201 });
}
