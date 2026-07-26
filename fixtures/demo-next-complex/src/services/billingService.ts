import { stripe } from '../lib/stripe';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';
import { sendEmail } from '../lib/email';
import { updateUserName } from '../lib/db/users';
import type { Plan } from '../types/billing';

export async function listPlans(): Promise<Plan[]> {
	const redis = getRedis();
	const cached = await redis.get('plans');
	if (cached) return JSON.parse(cached) as Plan[];
	const plans: Plan[] = [
		{ id: 'starter', name: 'Starter', priceCents: 900 },
		{ id: 'pro', name: 'Pro', priceCents: 2900 },
		{ id: 'enterprise', name: 'Enterprise', priceCents: 9900 },
	];
	await redis.setex('plans', 300, JSON.stringify(plans));
	return plans;
}

export async function syncSubscription(sub: {
	id: string;
	customer: string;
	status: string;
	metadata?: { userId?: string; displayName?: string };
}) {
	logger.info('billing.sync', { id: sub.id, status: sub.status });
	await getRedis().set(`sub:${sub.customer}`, JSON.stringify(sub));
	if (sub.metadata?.userId && sub.metadata.displayName) {
		// Cross-domain write from billing → users table
		await updateUserName(sub.metadata.userId, sub.metadata.displayName);
	}
	if (sub.status === 'active') {
		const customer = await stripe.customers.retrieve(sub.customer);
		if (!customer.deleted && customer.email) {
			await sendEmail(customer.email, 'Subscription active', `Plan ${sub.id}`);
		}
	}
}
