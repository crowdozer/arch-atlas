export const logger = {
	info(msg: string, extra?: unknown) {
		console.log('[next-demo]', msg, extra ?? '');
	},
	error(msg: string, extra?: unknown) {
		console.error('[next-demo]', msg, extra ?? '');
	},
};
