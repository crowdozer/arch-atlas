import { hubDispatch, hubQuickTotal } from '../../god/hub';
import { formatMoney, type Money } from '../../domain/money';

export function CartWidget(props: { lines: Money[] }) {
	const totalLabel = props.lines
		.map((m) => formatMoney(m))
		.join(' + ');
	const quick = hubQuickTotal(
		props.lines[0]?.amount ?? 0,
		props.lines[1]?.amount ?? 0,
	);

	return (
		<div className="cart">
			<p>{totalLabel}</p>
			<p>quick {quick}</p>
			<button
				type="button"
				onClick={() => {
					void hubDispatch({
						action: 'checkout',
						amounts: props.lines.map((l) => l.amount),
					});
				}}
			>
				Pay via hub
			</button>
		</div>
	);
}
