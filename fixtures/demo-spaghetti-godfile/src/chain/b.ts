import { chainC } from './c';

export function chainB(): number {
	return chainC() + 1;
}
