import type { Money } from './money';
import { add, zero } from './money';
import type { User } from './user';

export type OrderLine = { sku: string; qty: number; unit: Money };
export type Order = { id: string; userId: string; lines: OrderLine[] };

export function emptyOrder(user: User): Order {
	return { id: `ord_${user.id}`, userId: user.id, lines: [] };
}

export function orderTotal(order: Order): Money {
	return order.lines.reduce(
		(acc, line) =>
			add(acc, { amount: line.unit.amount * line.qty, currency: line.unit.currency }),
		zero(),
	);
}
