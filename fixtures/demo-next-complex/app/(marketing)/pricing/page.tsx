import { listPlans } from '../../../src/services/billingService';
import { PricingTable } from '../../../src/features/checkout/PricingTable';
import { trackPageView } from '../../../src/lib/analytics';

export default async function PricingPage() {
	await trackPageView('pricing');
	const plans = await listPlans();
	return (
		<section>
			<h1>Pricing</h1>
			<PricingTable plans={plans} />
		</section>
	);
}
