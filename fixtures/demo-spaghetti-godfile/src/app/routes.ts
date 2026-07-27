import { DashboardPage } from '../ui/pages/Dashboard';
import { CheckoutPage } from '../ui/pages/Checkout';
import { ProfilePage } from '../ui/pages/Profile';
import { hubDispatch } from '../god/hub';
import { runLegacyCheckout } from '../legacy/monolith';

export type Route = { path: string; title: string; render: () => unknown };

export const routes: Route[] = [
	{ path: '/', title: 'Dashboard', render: () => DashboardPage() },
	{ path: '/checkout', title: 'Checkout', render: () => CheckoutPage() },
	{ path: '/profile', title: 'Profile', render: () => ProfilePage() },
];

export async function prefetchRoute(path: string): Promise<void> {
	if (path === '/checkout') {
		await hubDispatch({ action: 'checkout', amounts: [1] });
		await runLegacyCheckout([1, 2]);
	} else {
		await hubDispatch({ action: 'bootstrap' });
	}
}
