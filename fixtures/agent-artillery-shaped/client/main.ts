import type { Game } from '../game';
import { createGame, step } from '../game';
import { createPhysics, integrate } from './sim/public';
import { getConfig } from '../config';
// Deep import past public façade — boundary crossing
import { createWeapon } from './sim/weapons';
// Alias-style import (resolved via tsconfig or --alias rewrite)
import { formatTick } from '@/modules/artillery/client/util';

export function boot(): Game {
	const g = createGame();
	const p = createPhysics();
	const w = createWeapon();
	void w;
	void getConfig();
	void formatTick(g.tick);
	integrate(p, g);
	return step(g);
}
