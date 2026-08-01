import { boot } from '../main';

/** Test path (__tests__) - product scope / omit should drop or stamp omitted. */
export function testBoot(): void {
	const g = boot();
	if (g.tick < 0) throw new Error('bad tick');
}
