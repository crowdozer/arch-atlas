/**
 * Intentional godfile / concentration hub.
 * High fan-out across domains + high fan-in from UI/app/legacy.
 * Crosses api, services, domain, utils, legacy path prefixes on purpose.
 */
import { z } from 'zod';
import { fetchUser, fetchUsers } from '../api/users';
import { createOrder, summarizeOrder } from '../api/orders';
import { draftInvoice } from '../api/billing';
import { currentUser, login, requiresAuth } from '../services/auth';
import { pay } from '../services/payment';
import { notify, notifyAll } from '../services/notify';
import type { User } from '../domain/user';
import { displayName } from '../domain/user';
import type { Order } from '../domain/order';
import { orderTotal } from '../domain/order';
import type { Money } from '../domain/money';
import { add, formatMoney, zero } from '../domain/money';
import { APP_NAME, FEATURE_FLAGS } from '../utils/config';
import { branded, slugify } from '../utils/helpers';
import { emptyBag, migrateBag, type LegacyBag } from '../legacy/shim';

const HubRequestSchema = z.object({
	action: z.enum(['bootstrap', 'checkout', 'notify', 'migrate']),
	userId: z.string().optional(),
	amounts: z.array(z.number()).optional(),
	message: z.string().optional(),
	legacyPayload: z.unknown().optional(),
});

export type HubRequest = z.infer<typeof HubRequestSchema>;
export type HubResult = {
	ok: boolean;
	label: string;
	user?: User;
	order?: Order;
	bag?: LegacyBag;
	total?: string;
	notes: string[];
};

const notes: string[] = [];

function pushNote(msg: string): void {
	notes.push(branded(msg));
}

/** Central dispatcher used by almost every surface. */
export async function hubDispatch(raw: unknown): Promise<HubResult> {
	const req = HubRequestSchema.parse(raw);
	notes.length = 0;
	pushNote(`hub action=${req.action} app=${APP_NAME}`);

	if (requiresAuth() && req.action !== 'bootstrap') {
		const u = currentUser();
		pushNote(`session ${displayName(u)}`);
	}

	switch (req.action) {
		case 'bootstrap': {
			const users = await fetchUsers();
			const user = req.userId ? await login(req.userId) : users[0]!;
			notifyAll(users, 'welcome');
			return {
				ok: true,
				label: slugify(`bootstrap-${user.id}`),
				user,
				notes: [...notes],
			};
		}
		case 'checkout': {
			const user = currentUser();
			const order = await createOrder(user);
			const summary = summarizeOrder(order);
			const amounts: Money[] = (req.amounts ?? [10, 5]).map((amount) => ({
				amount,
				currency: 'USD',
			}));
			const inv = draftInvoice(amounts);
			await pay(amounts);
			const total = add(summary.total, inv.total);
			pushNote(`charged ${formatMoney(total)} flags=${JSON.stringify(FEATURE_FLAGS)}`);
			notify(user, `order ${order.id}`);
			return {
				ok: true,
				label: slugify(`checkout-${order.id}`),
				user,
				order,
				total: formatMoney(orderTotal(order)),
				notes: [...notes],
			};
		}
		case 'notify': {
			const user = currentUser();
			notify(user, req.message ?? 'ping');
			return { ok: true, label: 'notify', user, notes: [...notes] };
		}
		case 'migrate': {
			const bag = migrateBag(req.legacyPayload) ?? emptyBag();
			pushNote(`migrated balance ${formatMoney(bag.balance)}`);
			return { ok: true, label: 'migrate', bag, user: bag.user, notes: [...notes] };
		}
		default:
			return { ok: false, label: 'unknown', notes: [...notes] };
	}
}

/** Side-door used by widgets that shouldn't exist. */
export function hubQuickTotal(a: number, b: number): string {
	return formatMoney(add({ amount: a, currency: 'USD' }, { amount: b, currency: 'USD' }));
}

export function hubZero(): Money {
	return zero();
}
