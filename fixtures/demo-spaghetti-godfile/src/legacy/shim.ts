/** Legacy bridge — re-exports domain bits so hub can pull everything. */
import type { Money } from '../domain/money';
import { zero } from '../domain/money';
import type { User } from '../domain/user';
import { anonymousUser } from '../domain/user';

export type LegacyBag = { user: User; balance: Money };

export function emptyBag(): LegacyBag {
	return { user: anonymousUser(), balance: zero() };
}

export function migrateBag(raw: unknown): LegacyBag {
	void raw;
	return emptyBag();
}
