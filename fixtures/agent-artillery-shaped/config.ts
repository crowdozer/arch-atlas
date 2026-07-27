import { loadSettings } from './settingsStore';

export type AppConfig = { debug: boolean; seed: number };

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
	if (!cached) {
		const s = loadSettings();
		cached = { debug: s.debug, seed: s.seed };
	}
	return cached;
}

export function resetConfig(): void {
	cached = null;
}
