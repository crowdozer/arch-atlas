export function Button(props: {
	label: string;
	onClick?: () => void;
	variant?: 'primary' | 'ghost';
}) {
	return (
		<button type="button" data-variant={props.variant ?? 'primary'} onClick={props.onClick}>
			{props.label}
		</button>
	);
}
