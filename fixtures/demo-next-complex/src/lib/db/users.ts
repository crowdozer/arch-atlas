import { query } from './client';
import type { User, UserCreate } from '../../types/user';
import { logger } from '../logger';

export async function getUserById(id: string): Promise<User | null> {
	const rows = await query<User>('select * from users where id = $1', [id]);
	return rows[0] ?? null;
}

export async function listAllUsers(): Promise<User[]> {
	return query<User>('select * from users order by created_at desc limit 100');
}

export async function insertUser(input: UserCreate, actorId: string): Promise<User> {
	logger.info('db.users.insert', { actorId, email: input.email });
	const rows = await query<User>(
		'insert into users (email, name) values ($1, $2) returning *',
		[input.email, input.name],
	);
	return rows[0]!;
}

export async function updateUserName(id: string, name: string): Promise<User> {
	const rows = await query<User>(
		'update users set name = $2 where id = $1 returning *',
		[id, name],
	);
	return rows[0]!;
}
