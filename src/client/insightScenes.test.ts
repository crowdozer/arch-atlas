/**
 * Insight scenes — load fixtures, parse URL, characterize known broken topology.
 * Pre-phase 0: these assert today's defects so later repair ships flip them.
 */
import { describe, expect, it } from 'vitest';
import { fileLongestDistances } from '@core/catalog/deepest.ts';
import {
	indexFiles,
	projectFileHub,
	projectModuleFocus,
} from '@core/index.ts';
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
	type SceneId,
} from './insightScenes.ts';

describe('insight scene catalog', () => {
	it('has unique ids and stable hrefs', () => {
		const ids = listInsightScenes().map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(isSceneId(id)).toBe(true);
			expect(sceneHref(id)).toBe(`/?scene=${id}`);
			expect(getInsightScene(id).id).toBe(id);
		}
	});

	it('parseSceneQuery reads Artillery-style ?scene=', () => {
		expect(parseSceneQuery('?scene=scarce-fanout')).toBe('scarce-fanout');
		expect(parseSceneQuery('scene=cyclic-depth&x=1')).toBe('cyclic-depth');
		expect(parseSceneQuery('?scene=missing')).toBeNull();
		expect(parseSceneQuery('')).toBeNull();
	});

	it('every scene loads at least one virtual file', () => {
		for (const scene of INSIGHT_SCENES) {
			const files = loadSceneFiles(scene.id);
			expect(files.length, scene.id).toBeGreaterThan(0);
			expect(files.every((f) => f.path && typeof f.content === 'string')).toBe(
				true,
			);
		}
	});

	it('scenePrimaryView matches open kind', () => {
		expect(scenePrimaryView(getInsightScene('scarce-fanout').open)).toEqual({
			type: 'file-hub',
			fileId: 'src/root.ts',
		});
		expect(scenePrimaryView(getInsightScene('label-collision').open)).toEqual({
			type: 'module',
			moduleId: 'react',
		});
		expect(scenePrimaryView(getInsightScene('sticky-package').open)).toEqual({
			type: 'file-hub',
			fileId: 'app.ts',
		});
	});
});

describe('insight scene characterizations (known broken today)', () => {
	it('scarce-fanout: unit-mass fan-out keeps both sibling branches (Phase 1B)', () => {
		const files = loadSceneFiles('scarce-fanout');
		const { graph } = indexFiles(files);
		const payload = projectFileHub(graph, 'src/root.ts', {
			maxDepth: 3,
			weightAxis: 'import-edges',
		});
		expect(payload).not.toBeNull();
		const nodeRef = payload!.meta.nodeRef;
		const hop2Children = new Set(
			payload!.data
				.filter((l) => {
					const src = nodeRef[l.source];
					return src?.kind === 'file' && src.id === 'src/a.ts';
				})
				.map((l) => nodeRef[l.target]?.id)
				.filter((id) => id === 'src/b.ts' || id === 'src/c.ts'),
		);
		expect(hop2Children.has('src/b.ts')).toBe(true);
		expect(hop2Children.has('src/c.ts')).toBe(true);
		// Fractional shares, positive, conserved from a
		const fromA = payload!.data.filter((l) => {
			const src = nodeRef[l.source];
			return src?.kind === 'file' && src.id === 'src/a.ts';
		});
		const sum = fromA.reduce((s, l) => s + l.value, 0);
		expect(sum).toBeCloseTo(1);
		expect(fromA.every((l) => l.value > 0)).toBe(true);
	});

	it('scarce-fanout topology stable across weight axes', () => {
		const files = loadSceneFiles('scarce-fanout');
		const { graph } = indexFiles(files);
		const idsFor = (axis: 'import-edges' | 'target-loc' | 'importer-loc') => {
			const payload = projectFileHub(graph, 'src/root.ts', {
				maxDepth: 3,
				weightAxis: axis,
			})!;
			const nodeRef = payload.meta.nodeRef;
			return new Set(
				payload.data
					.filter((l) => nodeRef[l.source]?.id === 'src/a.ts')
					.map((l) => nodeRef[l.target]?.id)
					.filter((id): id is string => !!id),
			);
		};
		const edges = idsFor('import-edges');
		const target = idsFor('target-loc');
		const importer = idsFor('importer-loc');
		// Uncapped topology membership (b and c) present on every axis
		for (const set of [edges, target, importer]) {
			expect(set.has('src/b.ts')).toBe(true);
			expect(set.has('src/c.ts')).toBe(true);
		}
	});

	it('cyclic-depth: c appears on long path after 1A+1B', () => {
		const files = loadSceneFiles('cyclic-depth');
		const { graph } = indexFiles(files);
		const { dist, maxHops } = fileLongestDistances(graph, 'src/root.ts');
		expect(dist.get('src/c.ts')).toBe(3);
		expect(maxHops).toBe(3);
		const payload = projectFileHub(graph, 'src/root.ts', {
			maxDepth: 4,
			weightAxis: 'import-edges',
		})!;
		const cNodes = payload.options.alluvial.nodes.filter(
			(n) => payload.meta.nodeRef[n.name]?.id === 'src/c.ts',
		);
		expect(cNodes.length).toBeGreaterThan(0);
	});

	it('label-collision: module react + package react collapses display identity', () => {
		const files = loadSceneFiles('label-collision');
		const { graph } = indexFiles(files);
		const payload = projectModuleFocus(graph, 'react');
		expect(payload).not.toBeNull();
		const selfLinks = payload!.data.filter((l) => l.source === l.target);
		const focusRef = payload!.meta.nodeRef['react'];
		const hasSelf = selfLinks.length > 0;
		const focusOverwritten =
			focusRef != null && focusRef.kind !== 'module';
		expect(hasSelf || focusOverwritten).toBe(true);
	});

	it('sticky-package: file hub paints claimName suffix for package react', () => {
		const files = loadSceneFiles('sticky-package');
		const { graph } = indexFiles(files);
		const payload = projectFileHub(graph, 'app.ts', {
			maxDepth: 1,
			weightAxis: 'import-edges',
		});
		expect(payload).not.toBeNull();
		const pkgEntry = Object.entries(payload!.meta.nodeRef).find(
			([, ref]) => ref.kind === 'package' && ref.id === 'react',
		);
		expect(pkgEntry).toBeTruthy();
		const [painted] = pkgEntry!;
		// Module leaf claimed "react" first → package becomes "react · package"
		expect(painted).toBe('react · package');
	});

	it('omitted-ends: module focus includes omitted target (catalog ends do not)', () => {
		const files = loadSceneFiles('omitted-ends');
		const omit = sceneOmitMatcher(
			getInsightScene('omitted-ends').omitPathPrefixes,
		);
		const { graph } = indexFiles(files, { isOmittedPath: omit });
		const omittedEdge = graph.edges.find((e) => e.toKind === 'omitted');
		expect(omittedEdge).toBeTruthy();

		const payload = projectModuleFocus(graph, 'src');
		expect(payload).not.toBeNull();
		const labels = Object.keys(payload!.meta.nodeRef);
		const leaked = labels.some(
			(l) => l.includes('hidden') || l.includes('omitted'),
		);
		expect(leaked).toBe(true);
	});
});

describe('scene open recipes cover triage packets', () => {
	it('maps to 1A / 1B / 2A / 2B', () => {
		const packets = new Set(INSIGHT_SCENES.map((s) => s.triagePacket));
		expect(packets.has('1A')).toBe(true);
		expect(packets.has('1B')).toBe(true);
		expect(packets.has('2A')).toBe(true);
		expect(packets.has('2B')).toBe(true);
	});

	it('SceneId union matches catalog length', () => {
		const all: SceneId[] = [
			'scarce-fanout',
			'cyclic-depth',
			'label-collision',
			'sticky-package',
			'omitted-ends',
		];
		expect(all.length).toBe(INSIGHT_SCENES.length);
	});
});
