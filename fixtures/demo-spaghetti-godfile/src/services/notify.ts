import type { User } from '../domain/user';
import { displayName } from '../domain/user';
import { branded } from '../utils/helpers';
import { APP_NAME } from '../utils/config';

export function notify(user: User, body: string): void {
	console.log(branded(`to ${displayName(user)} via ${APP_NAME}: ${body}`));
}

export function notifyAll(users: User[], body: string): void {
	for (const u of users) notify(u, body);
}
