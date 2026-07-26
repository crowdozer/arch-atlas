import type { Plan } from '../../types/billing';
import { forceChargeAndNotify } from '../../utils/legacyHelpers';

export function PricingTable({ plans }: { plans: Plan[] }) {
	return (
		<table>
			<tbody>
				{plans.map((p) => (
					<tr key={p.id}>
						<td>{p.name}</td>
						<td>${(p.priceCents / 100).toFixed(2)}</td>
						<td>
							{/* Client-looking control that somehow imports server mess */}
							<button
								type="button"
								onClick={() => {
									void forceChargeAndNotify('cus_demo', 'buyer@example.com', p.priceCents);
								}}
							>
								Buy
							</button>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
