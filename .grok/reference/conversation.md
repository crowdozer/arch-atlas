# Design conversation (vision input)

Source: product ideation chat (scaffold session). Compressed for agent use; not
product law until promoted into [scope.md](./scope.md) contracts.

## Spark

Alluvial map of imports/dependencies over a codebase by file. Rooted at API
routes, flows can look tree-like; map modules into categories (database, helper,
lib, external).

Example chain:

```text
/api/dossier → generateDossier → db/query → Database → Turso
/api/dossier → generateDossier → calculateIV → Domain logic
/api/dossier → generateDossier → fetchQuote → External API → FMP
```

Band width could encode static import count, reachable modules, runtime call
frequency, route execution time share, churn/defects, bundle weight, DB/external
request volume, token/monetary cost.

## Graph vs tree

Rooted at a route it looks tree-like, but the structure is a **directed graph**.
Shared helpers, cycles, dynamic imports, DI, callbacks - alluvial **merge bands**
are the point.

## Progressive expansion UX

1. Routes left, broad categories right.
2. Click a route → insert service/module stage.
3. Click Database → repositories, queries, tables.
4. Click a band → exact import/call path.
5. Reweight: static imports → runtime traffic, latency, churn, cost.

Useful views: architecture, blast radius, layer violations, god modules,
duplication, dead code, coupling, cost.

Visual semantics ideas: solid = static import; dotted = observed runtime; red =
forbidden boundary; desaturated = transitive; bright = recently changed; split
color = internal vs external.

## Category inference

Deterministic first: package names, ORM/clients, directory conventions, framework
exports, known SDKs, AST behaviors (fs/net/db/crypto/log). LLM for ambiguous
remainder + consolidation proposals. Store classifications as **reviewable
metadata**, not regenerate every time.

## Diff mode

Architecture before commit → after commit: new transitive deps, forbidden
boundary crossings, centralization around new abstractions. Architectural review
instrument, not just a code map novelty.

## Product pivot

Architecture is easy: ingest via ZIP → static analysis. Prefer **browser/local**
so code need not hit remote servers (supported language set + raw files).

At build/detect time: bucket frameworks and folder conventions; precompute a
useful list of potential views/maps (e.g. “API view” with toolkit: dep maps,
godfile hooks, database connections).

**Product is a local-first architecture compiler**, not merely an alluvial
dependency viewer:

```text
ZIP/files → language parsers → normalized graph → framework classifiers → suggested views
```

Normalized graph is durable core (File/Symbol/Route/DatabaseEntity/ExternalService/
Package/ArchitecturalCategory nodes; Imports/Calls/Exposes/Reads/Writes/… edges).
Everything else is a projection.

Framework adapters contribute: detection, file-role inference, extractors,
default categories, graph queries, recommended visualizations, smells, confidence.

Epistemic layers:

1. **Observed** - AST proves A imports B
2. **Inferred** - Prisma usage ⇒ database
3. **Declared** - user marks `/lib/store.ts` as infrastructure

Keep distinct; corrections propagate across projections.

## Browser stack ideas

Tree-sitter WASM; ZIP in Web Worker; IndexedDB/OPFS for graph+source; no source
upload; optional sanitized-graph export; adapter manifests shipped with the app.

Scale/symbol resolution is the hard part - capability ladder L1→L5 (see scope).

## UI entry

Open on a **map catalog**, not blank canvas:

> Detected: TypeScript · Astro · Turso · REST endpoints  
> Generated: API Surface · Route-to-Database · External Data Flow · Shared Modules · Coupling Hotspots

Selecting a view opens the alluvial with stage insertion, grouping, weighting,
confidence, static/runtime evidence.

## Positioning line

> Upload a repository; receive an explorable architectural atlas.

Alluvial = signature visual language; inferred catalog prevents “prettier dep graph.”

## Design language note (this repo)

Track **Sentinel** visual/UX grammar (Carbon wrappers, zinc/**teal**, alluvial
charts). Do not import Sentinel investing/ops domain.
