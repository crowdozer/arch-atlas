import { upsertOauthUser } from '../../lib/auth/oauth';
import { listPlans, syncSubscription } from '../../services/billingService';
import { dumpDebug, forceChargeAndNotify } from '../../utils/legacyHelpers';
import { logger } from '../../lib/logger';

/** CLI-ish entry used as alternate start for ops tooling. */
export async function runAdminJob(mode: 'sync' | 'charge' | 'oauth') {
	logger.info('admin.job', { mode });
	if (mode === 'oauth') {
		return upsertOauthUser({
			email: 'ops@example.com',
			name: 'Ops',
			provider: 'github',
		});
	}
	if (mode === 'charge') {
		return forceChargeAndNotify('cus_demo', 'ops@example.com', 100);
	}
	const plans = await listPlans();
	await syncSubscription({
		id: 'sub_demo',
		customer: 'cus_demo',
		status: 'active',
		metadata: { userId: 'user_1', displayName: 'Ops User' },
	});
	await dumpDebug('user_1');
	return plans;
}
