import Stripe from 'stripe';
import { logger } from './logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_demo', {
	apiVersion: '2024-06-20',
});

export async function chargeCustomer(customerId: string, amountCents: number) {
	logger.info('stripe.charge', { customerId, amountCents });
	return stripe.paymentIntents.create({
		amount: amountCents,
		currency: 'usd',
		customer: customerId,
	});
}

export function constructEvent(raw: string, signature: string) {
	return stripe.webhooks.constructEvent(
		raw,
		signature,
		process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_demo',
	);
}

export { stripe };
