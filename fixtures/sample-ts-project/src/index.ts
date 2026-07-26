import { createApp } from './app';
import { logger } from './lib/logger';
import { z } from 'zod';

const ConfigSchema = z.object({
	port: z.number().default(3000),
});

export function main() {
	logger.info('boot');
	return createApp(ConfigSchema.parse({}));
}
