/**
 * Type-only barrel — many type importers, zero runtime neighbors.
 * Must not rank as top hotspot when runtime hubs exist.
 */
export type { Game } from '../game';
export type { PhysicsState } from '../client/sim/physics';
export type { WeaponState } from '../client/sim/weapons';
export type Vec2 = { x: number; y: number };
export type EntityId = string;
