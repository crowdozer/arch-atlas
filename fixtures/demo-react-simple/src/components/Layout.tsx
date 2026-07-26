import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Button';

export function Layout({ children }: { children: ReactNode }) {
	return (
		<div className="app-shell">
			<header>
				<nav>
					<Link to="/">Home</Link>
					<Link to="/about">About</Link>
					<Link to="/profile">Profile</Link>
				</nav>
				<Button label="Sign in" onClick={() => undefined} />
			</header>
			<main>{children}</main>
		</div>
	);
}
