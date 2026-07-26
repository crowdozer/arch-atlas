import { NextResponse } from 'next/server';
import { constructEvent } from '../../../../src/lib/stripe';
import { markOrderPaid } from '../../../../src/services/orderService';
import { syncSubscription } from '../../../../src/services/billingService';
import { logger } from '../../../../src/lib/logger';
import { sendEmail } from '../../../../src/lib/email';

export async function POST(req: Request) {
	const sig = req.headers.get('stripe-signature') ?? '';
	const raw = await req.text();
	const event = constructEvent(raw, sig);

	logger.info('webhook.stripe', { type: event.type });

	if (event.type === 'payment_intent.succeeded') {
		const orderId = String(event.data.object.metadata?.orderId ?? '');
		if (orderId) {
			const order = await markOrderPaid(orderId);
			await sendEmail(order.email, 'Payment received', `Order ${order.id}`);
		}
	}

	if (event.type === 'customer.subscription.updated') {
		await syncSubscription(event.data.object);
	}

	return NextResponse.json({ received: true });
}
