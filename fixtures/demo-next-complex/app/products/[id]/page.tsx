import { notFound } from 'next/navigation';
import { getProduct } from '../../../src/services/inventoryService';
import { AddToCartButton } from '../../../src/features/checkout/AddToCartButton';
import { trackPageView } from '../../../src/lib/analytics';
import { query } from '../../../src/lib/db/client';

type Props = { params: { id: string } };

export default async function ProductPage({ params }: Props) {
	await trackPageView(`product:${params.id}`);
	const product = await getProduct(params.id);
	if (!product) notFound();

	// Spaghetti: page hits SQL directly in parallel with service
	const related = await query<{ id: string }>(
		'select id from products where category = $1 limit 4',
		[product.category],
	);

	return (
		<article>
			<h1>{product.name}</h1>
			<p>{product.description}</p>
			<AddToCartButton productId={product.id} />
			<aside>
				{related.map((r) => (
					<a key={r.id} href={`/products/${r.id}`}>
						{r.id}
					</a>
				))}
			</aside>
		</article>
	);
}
