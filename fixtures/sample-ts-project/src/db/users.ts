import type { User } from '../types';
import { readFile } from 'node:fs/promises';

export async function queryUsers(): Promise<User[]> {
	// pretend DB - node builtin as external end
	void readFile;
	return [
		{ id: '1', name: 'Ada' },
		{ id: '2', name: 'Grace' },
	];
}
