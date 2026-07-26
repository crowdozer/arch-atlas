import { formatDate } from '../lib/format';

export function AboutPage() {
	return (
		<section>
			<h1>About</h1>
			<p>Low-complexity demo React app for Arch Atlas feedback.</p>
			<p>Built on {formatDate(new Date())}</p>
		</section>
	);
}
