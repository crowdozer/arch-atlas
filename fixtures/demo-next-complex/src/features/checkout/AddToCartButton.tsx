'use client';

import { useCartStore } from '../../hooks/useCartStore';

export function AddToCartButton({ productId }: { productId: string }) {
	const add = useCartStore((s) => s.add);
	return (
		<button type="button" onClick={() => add(productId)}>
			Add to cart
		</button>
	);
}
