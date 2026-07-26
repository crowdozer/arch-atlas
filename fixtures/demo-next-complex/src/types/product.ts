export type Product = {
	id: string;
	name: string;
	description: string;
	category: string;
	priceCents: number;
	featured?: boolean;
	stock?: number;
};
