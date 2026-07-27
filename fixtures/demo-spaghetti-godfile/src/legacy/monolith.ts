/**
 * Legacy monolith that reaches into the god hub and domain directly.
 * Extra reverse path onto hub + money.
 */
import { hubDispatch, hubQuickTotal } from '../god/hub';
import { formatMoney, type Money } from '../domain/money';
import { emptyOrder } from '../domain/order';
import { anonymousUser } from '../domain/user';
import { migrateBag } from './shim';

export async function runLegacyCheckout(amounts: number[]): Promise<string> {
	const result = await hubDispatch({
		action: 'checkout',
		amounts,
		userId: 'legacy',
	});
	const bag = migrateBag({ amounts });
	const order = emptyOrder(anonymousUser());
	void order;
	const quick = hubQuickTotal(amounts[0] ?? 0, amounts[1] ?? 0);
	const balance: Money = bag.balance;
	return `${result.label}:${quick}:${formatMoney(balance)}`;
}

export function legacyPing(): string {
	return hubQuickTotal(1, 2);
}
