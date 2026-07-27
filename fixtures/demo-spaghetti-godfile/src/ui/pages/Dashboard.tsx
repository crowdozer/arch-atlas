import { hubDispatch } from '../../god/hub';
import { NavBar } from '../widgets/Nav';
import { CartWidget } from '../widgets/Cart';
import { fetchUsers } from '../../api/users';
import { zero } from '../../domain/money';

export function DashboardPage() {
	return (
		<section>
			<NavBar />
			<h1>Dashboard</h1>
			<button
				type="button"
				onClick={() => {
					void hubDispatch({ action: 'bootstrap' });
					void fetchUsers();
				}}
			>
				Load everything through hub
			</button>
			<CartWidget lines={[zero(), zero()]} />
		</section>
	);
}
