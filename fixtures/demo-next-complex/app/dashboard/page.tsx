import { OrderList } from '../../src/features/checkout/OrderList';
import { AdminFlags } from '../../src/features/admin/AdminFlags';
import { listOrdersForUser } from '../../src/services/orderService';
import { requireSession } from '../../src/lib/auth/session';
import { getRedis } from '../../src/lib/redis';
import { logger } from '../../src/lib/logger';

export default async function DashboardPage() {
	const session = await requireSession();
	const redis = getRedis();
	const cached = await redis.get(`dash:${session.userId}`);
	logger.info('dashboard.cache', { hit: Boolean(cached) });

	const orders = await listOrdersForUser(session.userId);
	return (
		<section>
			<h1>Dashboard</h1>
			<AdminFlags userId={session.userId} />
			<OrderList orders={orders} />
		</section>
	);
}
