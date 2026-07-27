import { hubDispatch } from '../../god/hub';
import { APP_NAME } from '../../utils/config';
import { currentUser } from '../../services/auth';
import { displayName } from '../../domain/user';

export function NavBar() {
	const user = currentUser();
	return (
		<nav>
			<strong>{APP_NAME}</strong>
			<span>{displayName(user)}</span>
			<button
				type="button"
				onClick={() => {
					void hubDispatch({ action: 'bootstrap', userId: user.id });
				}}
			>
				Re-bootstrap
			</button>
		</nav>
	);
}
