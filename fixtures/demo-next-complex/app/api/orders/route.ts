import { NextResponse } from 'next/server';
import { createOrder, listOrdersForUser } from '../../../src/services/orderService';
import { requireSession } from '../../../src/lib/auth/session';
import { chargeCustomer } from '../../../src/lib/stripe';
import { OrderCreateSchema } from '../../../src/types/order';
import { logger } from '../../../src/lib/logger';

export async function GET() {
	const session = await requireSession();
	return NextResponse.json({
		orders: await listOrdersForUser(session.userId),
	});
}

export async function POST(req: Request) {
	const session = await requireSession();
	const body = OrderCreateSchema.parse(await req.json());
	// API layer calls stripe directly (bypass billing service) - intentional mess
	const payment = await chargeCustomer(session.stripeCustomerId, body.totalCents);
	const order = await createOrder(session.userId, body, payment.id);
	logger.info('api.orders.create', { orderId: order.id, paymentId: payment.id });
	return NextResponse.json({ order }, { status: 201 });
}
