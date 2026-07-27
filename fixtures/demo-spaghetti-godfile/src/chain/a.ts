import { chainB } from './b';
import { branded } from '../utils/helpers';

/** Top of reverse chain: main → a → b → c → d (d has deep reverse hops). */
export function chainStart(): string {
	const n = chainB();
	return branded(`chain ${n}`);
}
