import { query } from './client';
import type { Product } from '../../types/product';

export async function listFeatured(): Promise<Product[]> {
	return query<Product>(
		'select * from products where featured = true order by rank asc limit 12',
	);
}

export async function getById(id: string): Promise<Product | null> {
	const rows = await query<Product>('select * from products where id = $1', [id]);
	return rows[0] ?? null;
}
