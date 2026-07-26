import nodemailer from 'nodemailer';
import { logger } from './logger';
import { getRedis } from './redis';

const transport = nodemailer.createTransport({
	host: process.env.SMTP_HOST ?? 'localhost',
	port: Number(process.env.SMTP_PORT ?? 1025),
});

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
	const redis = getRedis();
	const suppressed = await redis.sismember('email:suppress', to);
	if (suppressed) {
		logger.info('email.suppressed', { to });
		return;
	}
	await transport.sendMail({ from: 'demo@example.com', to, subject, text: body });
	logger.info('email.sent', { to, subject });
}
