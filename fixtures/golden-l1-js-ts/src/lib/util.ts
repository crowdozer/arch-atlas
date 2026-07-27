export type UtilResult = { ok: boolean; value: string };

export function util(value: string): UtilResult {
	return { ok: true, value };
}
