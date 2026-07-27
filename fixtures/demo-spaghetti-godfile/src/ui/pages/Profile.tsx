import { hubDispatch } from '../../god/hub';
import { login, currentUser } from '../../services/auth';
import { displayName } from '../../domain/user';
import { notify } from '../../services/notify';

export function ProfilePage() {
	const user = currentUser();
	return (
		<section>
			<h1>Profile · {displayName(user)}</h1>
			<button
				type="button"
				onClick={() => {
					void login('u1').then((u) => {
						notify(u, 'profile opened');
						return hubDispatch({ action: 'notify', message: 'hi from profile' });
					});
				}}
			>
				Login via hub path
			</button>
		</section>
	);
}
