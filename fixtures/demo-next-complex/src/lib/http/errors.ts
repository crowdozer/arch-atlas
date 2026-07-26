export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export function assertFound<T>(value: T | null | undefined, msg = 'Not found'): T {
	if (value == null) throw new HttpError(404, msg);
	return value;
}
