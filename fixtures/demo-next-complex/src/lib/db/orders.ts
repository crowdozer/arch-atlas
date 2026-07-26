import { query, withTransaction } from './client';
import type { Order, OrderCreate } from '../../types/order';
import { logger } from '../logger';

export async function listOrdersByUser(userId: string): Promise<Order[]> {
	return query<Order>('select * from orders where user_id = $1 order by created_at desc', [
		userId,
	]);
}

export async function insertOrder(
	userId: string,
	input: OrderCreate,
	paymentId: string,
): Promise<Order> {
	return withTransaction(async (q) => {
		logger.info('db.orders.insert', { userId, paymentId });
		const rows = await q<Order>(
			`insert into orders (user_id, total_cents, payment_id, status, email)
       values ($1, $2, $3, 'pending', $4) returning *`,
			[userId, input.totalCents, paymentId, input.email],
		);
		for (const item of input.items) {
			await q('insert into order_items (order_id, product_id, qty) values ($1, $2, $3)', [
				rows[0]!.id,
				item.productId,
				item.qty,
			]);
		}
		return rows[0]!;
	});
}

export async function setOrderStatus(orderId: string, status: string): Promise<Order> {
	const rows = await query<Order>(
		'update orders set status = $2 where id = $1 returning *',
		[orderId, status],
	);
	return rows[0]!;
}
