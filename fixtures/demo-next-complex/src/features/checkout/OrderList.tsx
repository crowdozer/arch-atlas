import type { Order } from '../../types/order';

export function OrderList({ orders }: { orders: Order[] }) {
	return (
		<ul>
			{orders.map((o) => (
				<li key={o.id}>
					{o.id} · {o.status} · ${(o.totalCents / 100).toFixed(2)}
				</li>
			))}
		</ul>
	);
}
