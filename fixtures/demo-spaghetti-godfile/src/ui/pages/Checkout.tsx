import { hubDispatch, hubQuickTotal } from '../../god/hub';
import { CartWidget } from '../widgets/Cart';
import { pay } from '../../services/payment';
import type { Money } from '../../domain/money';

const demoLines: Money[] = [
	{ amount: 19.99, currency: 'USD' },
	{ amount: 4.5, currency: 'USD' },
];

export function CheckoutPage() {
	return (
		<section>
			<h1>Checkout</h1>
			<p>shortcut {hubQuickTotal(19.99, 4.5)}</p>
			<CartWidget lines={demoLines} />
			<button
				type="button"
				onClick={() => {
					void hubDispatch({ action: 'checkout', amounts: [19.99, 4.5] });
					void pay(demoLines);
				}}
			>
				Confirm
			</button>
		</section>
	);
}
