import { charge, draftInvoice, type Invoice } from '../api/billing';
import type { Money } from '../domain/money';
import { formatMoney } from '../domain/money';
import { branded } from '../utils/helpers';

export async function pay(amounts: Money[]): Promise<Invoice> {
	const inv = draftInvoice(amounts);
	console.log(branded(`charging ${formatMoney(inv.total)}`));
	return charge(inv);
}
