/**
 * Façade surface - re-exports sim modules. Deep importers should use this,
 * not physics.ts / weapons.ts directly.
 */
export { createPhysics, integrate, type PhysicsState } from './physics';
export { createWeapon, tickWeapons, type WeaponState } from './weapons';
