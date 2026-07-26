import { z } from 'zod';

export const OrderCreateSchema = z.object({
	email: z.string().email(),
	totalCents: z.number().int().positive(),
	items: z
		.array(
			z.object({
				productId: z.string(),
				qty: z.number().int().positive(),
			}),
		)
		.min(1),
});

export type OrderCreate = z.infer<typeof OrderCreateSchema>;

export type Order = {
	id: string;
	userId: string;
	totalCents: number;
	paymentId: string;
	status: string;
	email: string;
};
