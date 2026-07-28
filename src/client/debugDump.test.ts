import { describe, expect, it } from 'vitest';
import {
	DEBUG_DUMP_SCHEMA,
	buildAlluvialDebugDump,
} from './debugDump.ts';
import type { AlluvialPayload } from '@core/graph/types.ts';

describe('buildAlluvialDebugDump', () => {
	it('emits schema and host slice without carbon when no holder', () => {
		const payload = {
			data: [{ source: 'a', target: 'b', value: 3 }],
			options: {
				alluvial: {
					units: 'loc',
					nodes: [{ name: 'a', category: 'Imports', rank: 0 }],
					nodeAlignment: 'left',
				},
				color: { scale: { a: '#fff' } },
			},
			meta: {
				focus: { kind: 'file', id: 'f', label: 'f' },
				nodeRef: { a: { kind: 'file', id: 'a' } },
				nodeRank: { a: 0 },
			},
		} as unknown as AlluvialPayload;

		const dump = buildAlluvialDebugDump({
			payload,
			holder: null,
			host: {
				viewStack: [{ type: 'file-hub', fileId: 'f' }],
				currentView: { type: 'file-hub', fileId: 'f' },
				weightAxis: 'target-loc',
				bandSort: 'flow',
				locPrecision: 'estimate',
				vizMaxDepth: 3,
				interactionMode: 'drill',
				includeTests: false,
				pendingPackageFocusLabel: null,
				programExactMass: false,
				engineFailed: false,
			},
		});

		expect(dump.schema).toBe(DEBUG_DUMP_SCHEMA);
		expect(dump.payload?.null).toBe(false);
		expect(dump.payload?.data).toHaveLength(1);
		expect(dump.payload?.meta?.nodeRank).toEqual({ a: 0 });
		expect(dump.carbon).toBeNull();
		expect(dump.host.bandSort).toBe('flow');
		expect(dump.agentHint.length).toBeGreaterThan(20);
	});

	it('records null payload', () => {
		const dump = buildAlluvialDebugDump({
			payload: null,
			holder: null,
			host: {
				viewStack: [],
				currentView: null,
				weightAxis: 'import-edges',
				bandSort: 'name',
				locPrecision: 'estimate',
				vizMaxDepth: 1,
				interactionMode: 'inspect',
				includeTests: true,
				pendingPackageFocusLabel: null,
				programExactMass: false,
				engineFailed: false,
			},
		});
		expect(dump.payload?.null).toBe(true);
	});
});
