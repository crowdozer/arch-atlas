import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AboutPage } from './pages/About';
import { HomePage } from './pages/Home';
import { ProfilePage } from './pages/Profile';

export function App() {
	return (
		<Layout>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/about" element={<AboutPage />} />
				<Route path="/profile" element={<ProfilePage />} />
			</Routes>
		</Layout>
	);
}
