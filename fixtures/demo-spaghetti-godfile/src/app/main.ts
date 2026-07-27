import { routes, prefetchRoute } from './routes';
import { hubDispatch } from '../god/hub';
import { FEATURE_FLAGS } from '../utils/config';
import { runLegacyCheckout, legacyPing } from '../legacy/monolith';
import { chainStart } from '../chain/a';

export async function boot(): Promise<void> {
	console.log('flags', FEATURE_FLAGS);
	console.log(legacyPing());
	await hubDispatch({ action: 'bootstrap', userId: 'u1' });
	await prefetchRoute('/');
	await runLegacyCheckout([9, 1]);
	// long reverse chain leaf
	chainStart();
	for (const r of routes) {
		void r.render();
	}
}

void boot();
