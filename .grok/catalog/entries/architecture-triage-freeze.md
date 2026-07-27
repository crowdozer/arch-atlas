---
id: architecture-triage-freeze
kind: plan
state: partial
authority: advisory
provenance: ship
scope:
  - architecture-triage
  - host-shared-exact
  - app-composition-root
  - hub-freeze
  - types-co-location
  - barrels
applies_when:
  - thinning app.ts
  - moving Exact engines
  - hub or alluvial cleanup urge
  - types.ts split urge
  - barrel purge urge
touches:
  - src/exact
  - src/client/app.ts
  - src/client/exactPaintMode.ts
  - src/client/sessionLifecycle.ts
  - src/client/wireUi.ts
  - src/cli/exactSurface.ts
  - src/core/view
  - src/core/graph/types.ts
  - src/core/index.ts
invariants:
  - Exact host-shared package is src/exact (@exact); not pure core (CDN fetch OK)
  - CLI must not import src/client
  - Hub column/mass matrix is frozen unless product intent + goldens
  - types.ts SoR/catalog/alluvial co-location is provisional; split only when import churn is forced
  - Barrel/register/treeIcons cleanup is docs/agent note only until API surface is intentional
related:
  - dual-host-shell-stage
  - exact-surface-mode-futures
  - analysis-capability-honesty
superseded_by: null
rationale_quality: full
---

# Architecture triage freeze (phase map)

Ship phased triage: land host-shared Exact + thin app extracts; freeze
hub/types/barrels.

## Phase 1 (landed this ship)

| Target | Action |
| ------ | ------ |
| Exact placement | `src/exact/` + `@exact`; CLI/web share; no CDN in core |
| Thin `app.ts` | `exactPaintMode.ts` + `wireUi.ts` extracts; composition root stays |
| Hub / types / barrels | **Freeze** — document only |

## Phase 2-A (landed)

| Target | Action |
| ------ | ------ |
| Session lifecycle | `src/client/sessionLifecycle.ts` — zip/demo/open/restore/reset/activate via param-object deps; viewStack ownership stays in `app.ts` |

## Deferred

| Phase | Work |
| ----- | ---- |
| 2 (remainder) | Hub helper dedupe only with goldens |
| 3+ | Dual projector deprecate if product picks one; `types.ts` split when churn forced; public API docs for agents |

## Do not

- Hub geometry / mass / pad / ring renames without matrix intent
- Put `loadTypescript` CDN into `src/core`
- Re-open stage e2e / VS Code extension as part of triage cleanup
