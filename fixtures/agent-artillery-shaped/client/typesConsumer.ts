/** Type-only consumers of the types barrel (inflate type traffic, not runtime). */
import type { Game, Vec2, EntityId } from '../types/index';
import type { PhysicsState } from '../types/index';
import type { WeaponState } from '../types/index';

export type Snapshot = {
	game: Game;
	pos: Vec2;
	id: EntityId;
	physics: PhysicsState;
	weapon: WeaponState;
};
