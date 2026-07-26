import { z } from 'zod';

export const UserCreateSchema = z.object({
	email: z.string().email(),
	name: z.string().min(1),
});

export type UserCreate = z.infer<typeof UserCreateSchema>;

export type User = {
	id: string;
	email: string;
	name: string;
	stripeCustomerId?: string;
	created_at?: string;
};
