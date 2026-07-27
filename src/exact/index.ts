/**
 * Host-shared Exact (export-surface) package.
 *
 * Not pure core: loader may fetch CDN TypeScript. Web + CLI import here;
 * CLI must not depend on `src/client/`. Pure language→engine map stays in
 * `@core/exact/engineMap`.
 */

export {
	collectExportSpansFromText,
	massForBindings,
	pickSpansForBindings,
	type ExportSpan,
} from './exportSurface.ts';

export {
	collectExportSpansFromTs,
	createTsProgramProvider,
	isClassicTypescriptModule,
	type CreateTsProgramProviderOpts,
	type TypescriptModule,
} from './tsProgramProvider.ts';

export {
	loadTypescript,
	typescriptCdnUrls,
	type LoadTypescriptOpts,
	type LoadTypescriptResult,
	type LoadTypescriptSource,
} from './loadTypescript.ts';

export {
	ensureExactForGraph,
	ensureExactLocalOnly,
	isLocalExactSource,
	type EnsureExactOpts,
	type EnsureExactResult,
	type EnsureExactSource,
} from './ensureExact.ts';
