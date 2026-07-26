import type { Product } from '../../types/product';
import { AddToCartButton } from '../checkout/AddToCartButton';

export function ProductCard({ product }: { product: Product }) {
	return (
		<article>
			<a href={`/products/${product.id}`}>
				<h3>{product.name}</h3>
			</a>
			<p>${(product.priceCents / 100).toFixed(2)}</p>
			<AddToCartButton productId={product.id} />
		</article>
	);
}
