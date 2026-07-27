import { APP_NAME } from './config';

export function slugify(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function branded(msg: string): string {
	return `[${APP_NAME}] ${msg}`;
}

export function pick<T>(arr: T[], i: number): T | undefined {
	return arr[i];
}
