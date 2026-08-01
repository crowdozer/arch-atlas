/** Shared money primitives - high reverse blast (many consumers). */
export type Money = { amount: number; currency: string };

export function zero(currency = 'USD'): Money {
	return { amount: 0, currency };
}

export function add(a: Money, b: Money): Money {
	if (a.currency !== b.currency) throw new Error('currency mismatch');
	return { amount: a.amount + b.amount, currency: a.currency };
}

export function formatMoney(m: Money): string {
	return `${m.currency} ${m.amount.toFixed(2)}`;
}
