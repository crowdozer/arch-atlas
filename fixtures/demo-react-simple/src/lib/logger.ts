export const logger = {
	info(msg: string, extra?: unknown) {
		console.log('[demo]', msg, extra ?? '');
	},
	error(msg: string, extra?: unknown) {
		console.error('[demo]', msg, extra ?? '');
	},
};
