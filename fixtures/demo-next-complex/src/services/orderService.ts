import { insertOrder, listOrdersByUser, setOrderStatus } from '../lib/db/orders';
import { getUserById } from '../lib/db/users';
import { sendEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import type { Order, OrderCreate } from '../types/order';
import { assertFound } from '../lib/http/errors';
import { reserveStock } from './inventoryService';

export async function listOrdersForUser(userId: string): Promise<Order[]> {
	return listOrdersByUser(userId);
}

export async function createOrder(
	userId: string,
	input: OrderCreate,
	paymentId: string,
): Promise<Order> {
	for (const item of input.items) {
		await reserveStock(item.productId, item.qty);
	}
	const order = await insertOrder(userId, input, paymentId);
	await getRedis().del(`dash:${userId}`);
	logger.info('orderService.create', { orderId: order.id });
	return order;
}

export async function markOrderPaid(orderId: string): Promise<Order> {
	const order = await setOrderStatus(orderId, 'paid');
	const user = assertFound(await getUserById(order.userId));
	await sendEmail(user.email, 'Order paid', `Thanks for order ${order.id}`);
	// mutate email onto order for webhook convenience (mess)
	return { ...order, email: user.email };
}
