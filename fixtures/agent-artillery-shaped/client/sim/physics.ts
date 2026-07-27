import type { Game } from '../../game';
import { tickWeapons } from './weapons';

export type PhysicsState = { x: number; y: number; vx: number; vy: number };

export function createPhysics(): PhysicsState {
	return { x: 0, y: 0, vx: 0, vy: 0 };
}

/** Runtime mutual cycle with weapons.ts */
export function integrate(p: PhysicsState, _g: Game): PhysicsState {
	tickWeapons();
	return { ...p, x: p.x + p.vx, y: p.y + p.vy };
}
