import { updateProfile } from '../../../src/services/userService';
import { requireSession } from '../../../src/lib/auth/session';
import { sendEmail } from '../../../src/lib/email';
import { SettingsForm } from '../../../src/components/ui/SettingsForm';

export default async function SettingsPage() {
	const session = await requireSession();

	async function save(formData: FormData) {
		'use server';
		const name = String(formData.get('name') ?? '');
		await updateProfile(session.userId, { name });
		await sendEmail(session.email, 'Profile updated', `Hi ${name}`);
	}

	return (
		<section>
			<h1>Settings</h1>
			<SettingsForm action={save} defaultEmail={session.email} />
		</section>
	);
}
