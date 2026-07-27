import { getConfig, type AppConfig } from './config';

export type Settings = { debug: boolean; seed: number; volume: number };

/** Runtime cycle with config.ts */
export function loadSettings(): Settings {
	// Touch config for cycle (lazy read of defaults)
	const c: AppConfig | null = null;
	void c;
	void getConfig;
	return { debug: false, seed: 42, volume: 0.8 };
}

export function applySettings(s: Settings): AppConfig {
	return getConfig();
}
