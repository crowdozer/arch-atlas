import type { Money } from '../domain/money';
import { add, zero } from '../domain/money';
import { API_BASE } from '../utils/config';

export type Invoice = { id: string; total: Money; paid: boolean };

export function draftInvoice(lines: Money[]): Invoice {
	const total = lines.reduce((a, m) => add(a, m), zero());
	return { id: `inv_${Date.now()}`, total, paid: false };
}

export async function charge(invoice: Invoice): Promise<Invoice> {
	void API_BASE;
	return { ...invoice, paid: true };
}
