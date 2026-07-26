import { Pool } from 'pg';
import { logger } from '../logger';

const pool = new Pool({
	connectionString: process.env.DATABASE_URL ?? 'postgres://localhost/demo',
});

export async function query<T = Record<string, unknown>>(
	sql: string,
	params: unknown[] = [],
): Promise<T[]> {
	logger.info('db.query', { sql: sql.slice(0, 80) });
	const result = await pool.query(sql, params);
	return result.rows as T[];
}

export async function withTransaction<T>(fn: (q: typeof query) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('begin');
		const q: typeof query = async (sql, params = []) => {
			const result = await client.query(sql, params);
			return result.rows as never;
		};
		const out = await fn(q);
		await client.query('commit');
		return out;
	} catch (err) {
		await client.query('rollback');
		throw err;
	} finally {
		client.release();
	}
}
