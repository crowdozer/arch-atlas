/** Core game type + runtime hub. */
export type Game = {
	tick: number;
	running: boolean;
};

export function createGame(): Game {
	return { tick: 0, running: false };
}

export function step(g: Game): Game {
	return { ...g, tick: g.tick + 1 };
}
