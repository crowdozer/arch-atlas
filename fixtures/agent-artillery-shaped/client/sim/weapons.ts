import { createPhysics, type PhysicsState } from './physics';

export type WeaponState = { cooldown: number; ammo: number };

let lastPhysics: PhysicsState | null = null;

export function createWeapon(): WeaponState {
	return { cooldown: 0, ammo: 10 };
}

/** Runtime mutual cycle with physics.ts */
export function tickWeapons(): void {
	lastPhysics = createPhysics();
}

export function getLastPhysics(): PhysicsState | null {
	return lastPhysics;
}
