import { handleRequest } from './routes/api';
import { queryUsers } from './db/users';
import type { Config } from './types';

export function createApp(config: Config) {
	return {
		config,
		async handle(req: { path: string }) {
			const users = await queryUsers();
			return handleRequest(req, users);
		},
	};
}
