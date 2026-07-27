/** Chain leaf — deep reverse blast target. */
import type { Money } from '../domain/money';
import { formatMoney, zero } from '../domain/money';

export function chainLeaf(): Money {
	const m = zero('USD');
	console.log('leaf', formatMoney(m));
	return m;
}
