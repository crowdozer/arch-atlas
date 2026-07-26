import { ProductGrid } from '../src/features/catalog/ProductGrid';
import { listFeaturedProducts } from '../src/services/inventoryService';
import { trackPageView } from '../src/lib/analytics';
import { MarketingHero } from '../src/components/layout/MarketingHero';

export default async function HomePage() {
	await trackPageView('home');
	const products = await listFeaturedProducts();
	return (
		<>
			<MarketingHero title="Commerce demo" />
			<ProductGrid products={products} />
		</>
	);
}
