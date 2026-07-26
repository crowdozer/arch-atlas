import { getById, listFeatured } from '../lib/db/products';
import { query } from '../lib/db/client';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';
import type { Product } from '../types/product';
import { HttpError } from '../lib/http/errors';

export async function listFeaturedProducts(): Promise<Product[]> {
	return listFeatured();
}

export async function getProduct(id: string): Promise<Product | null> {
	const redis = getRedis();
	const hit = await redis.get(`product:${id}`);
	if (hit) return JSON.parse(hit) as Product;
	const product = await getById(id);
	if (product) await redis.setex(`product:${id}`, 60, JSON.stringify(product));
	return product;
}

export async function reserveStock(productId: string, qty: number): Promise<void> {
	logger.info('inventory.reserve', { productId, qty });
	const rows = await query<{ stock: number }>(
		'update products set stock = stock - $2 where id = $1 and stock >= $2 returning stock',
		[productId, qty],
	);
	if (!rows.length) throw new HttpError(409, 'Insufficient stock');
	await getRedis().del(`product:${productId}`);
}
