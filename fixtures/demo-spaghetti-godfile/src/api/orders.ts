import type { Order } from '../domain/order';
import { emptyOrder, orderTotal } from '../domain/order';
import type { Money } from '../domain/money';
import { formatMoney } from '../domain/money';
import type { User } from '../domain/user';
import { branded } from '../utils/helpers';

export async function createOrder(user: User): Promise<Order> {
	console.log(branded(`create order for ${user.id}`));
	return emptyOrder(user);
}

export function summarizeOrder(order: Order): { total: Money; label: string } {
	const total = orderTotal(order);
	return { total, label: formatMoney(total) };
}
