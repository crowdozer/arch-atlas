/**
 * Catch-all helpers imported from too many places - god-module demo.
 */
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { query } from '../lib/db/client';
import { sendEmail } from '../lib/email';
import { chargeCustomer } from '../lib/stripe';

export function slugify(input: string): string {
	return input.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export async function dumpDebug(userId: string): Promise<Record<string, unknown>> {
	const redis = getRedis();
	const keys = await redis.keys(`*${userId}*`);
	const orders = await query('select count(*)::int as n from orders where user_id = $1', [
		userId,
	]);
	logger.info('legacy.dump', { userId, keys: keys.length });
	return { keys, orderCount: orders[0] };
}

/** Used by admin feature - mixes email + payments. */
export async function forceChargeAndNotify(
	customerId: string,
	email: string,
	cents: number,
) {
	const payment = await chargeCustomer(customerId, cents);
	await sendEmail(email, 'Manual charge', `Charged ${cents} (${payment.id})`);
	return payment;
}
