import { useCallback, useEffect, useState } from 'react';
import { fetchUser } from '../lib/api';
import type { User } from '../types';

export function useUser(id: string) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			setUser(await fetchUser(id));
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void reload();
	}, [reload]);

	return { user, loading, reload };
}
