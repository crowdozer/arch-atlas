/**
 * Insight scene support — catalog API + helpers stay even when the product
 * catalog is empty (triage closed). Fixture regressions for the closed packets
 * live in core/stage tests that walk fixtures/scene-*.
 */
import { describe, expect, it } from 'vitest';
import {
	INSIGHT_SCENES,
	getInsightScene,
	isSceneId,
	listInsightScenes,
	loadSceneFiles,
	parseSceneQuery,
	sceneHref,
	sceneOmitMatcher,
	scenePrimaryView,
} from './insightScenes.ts';

describe('insight scene catalog (dormant)', () => {
	it('has an empty product catalog after triage closeout', () => {
		expect(listInsightScenes()).toEqual([]);
		expect(INSIGHT_SCENES).toHaveLength(0);
		expect(isSceneId('scarce-fanout')).toBe(false);
		expect(isSceneId('missing')).toBe(false);
		expect(isSceneId(null)).toBe(false);
	});

	it('parseSceneQuery ignores unregistered scene ids', () => {
		expect(parseSceneQuery('?scene=scarce-fanout')).toBeNull();
		expect(parseSceneQuery('scene=cyclic-depth&x=1')).toBeNull();
		expect(parseSceneQuery('?scene=missing')).toBeNull();
		expect(parseSceneQuery('')).toBeNull();
	});

	it('getInsightScene / loadSceneFiles fail closed for unknown ids', () => {
		expect(() => getInsightScene('scarce-fanout')).toThrow(/Unknown insight scene/);
		expect(() => loadSceneFiles('scarce-fanout')).toThrow(/no fixture loader/);
	});

	it('sceneHref remains shareable when scenes are re-registered', () => {
		expect(sceneHref('future-scene')).toBe('/?scene=future-scene');
	});

	it('scenePrimaryView maps open kinds', () => {
		expect(
			scenePrimaryView({
				kind: 'file-hub',
				fileId: 'src/root.ts',
			}),
		).toEqual({ type: 'file-hub', fileId: 'src/root.ts' });
		expect(
			scenePrimaryView({
				kind: 'module',
				moduleId: 'react',
			}),
		).toEqual({ type: 'module', moduleId: 'react' });
		expect(
			scenePrimaryView({
				kind: 'package-hub-via-file',
				fileId: 'app.ts',
				packageId: 'react',
			}),
		).toEqual({ type: 'file-hub', fileId: 'app.ts' });
	});

	it('sceneOmitMatcher matches path prefixes', () => {
		const omit = sceneOmitMatcher(['src/hidden']);
		expect(omit).toBeTypeOf('function');
		expect(omit!('src/hidden.ts')).toBe(true);
		expect(omit!('src/hidden/x.ts')).toBe(true);
		expect(omit!('src/visible.ts')).toBe(false);
		expect(sceneOmitMatcher(undefined)).toBeUndefined();
		expect(sceneOmitMatcher([])).toBeUndefined();
	});
});
