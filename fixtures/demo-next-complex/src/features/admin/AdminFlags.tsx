import { getRedis } from '../../lib/redis';
import { dumpDebug } from '../../utils/legacyHelpers';
import { listUsers } from '../../services/userService';

export async function AdminFlags({ userId }: { userId: string }) {
	const redis = getRedis();
	const flags = await redis.hgetall(`flags:${userId}`);
	const debug = await dumpDebug(userId);
	// Admin widget lists all users from service (broad fan-out)
	const users = await listUsers();

	return (
		<aside>
			<pre>{JSON.stringify({ flags, debug, userCount: users.length }, null, 2)}</pre>
		</aside>
	);
}
