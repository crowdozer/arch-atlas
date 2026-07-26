export function SettingsForm({
	action,
	defaultEmail,
}: {
	action: (data: FormData) => Promise<void>;
	defaultEmail: string;
}) {
	return (
		<form action={action}>
			<label>
				Email
				<input name="email" defaultValue={defaultEmail} readOnly />
			</label>
			<label>
				Name
				<input name="name" />
			</label>
			<button type="submit">Save</button>
		</form>
	);
}
