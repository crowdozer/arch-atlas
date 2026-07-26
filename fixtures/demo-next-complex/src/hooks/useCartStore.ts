import { create } from 'zustand';

type CartItem = { productId: string; qty: number };

type CartState = {
	items: CartItem[];
	add: (productId: string, qty?: number) => void;
	clear: () => void;
};

export const useCartStore = create<CartState>((set) => ({
	items: [],
	add: (productId, qty = 1) =>
		set((s) => {
			const existing = s.items.find((i) => i.productId === productId);
			if (existing) {
				return {
					items: s.items.map((i) =>
						i.productId === productId ? { ...i, qty: i.qty + qty } : i,
					),
				};
			}
			return { items: [...s.items, { productId, qty }] };
		}),
	clear: () => set({ items: [] }),
}));
