---
id: exact-surface-mode-futures
kind: idea
state: active
authority: advisory
provenance: ship

scope:
  - exact-mode
  - imported-surface
  - typescript-program
  - multi-language
  - dual-host
  - engine-loader
  - weight-axis
  - inspect
applies_when:
  - Exact or Imported LOC (Shaken) precision work
  - mixed estimate/exact band UI
  - pinning TypeScript engine version
  - multi-language engines (pyright, gopls)
  - full LSP JSON-RPC in browser tab
  - VS Code extension Exact inject via ImportedSurfaceProvider
  - Program-informed re-index under Exact
  - progressive stage / src/stage dual-host extract
touches:
  - src/core/exact/engineMap.ts
  - src/core/view/weight.ts
  - src/core/view/importedSurface.ts
  - src/client/exact/
  - src/client/app.ts
  - src/shell/controls.ts
  - extension/ (future)
  - dual-host-shell-stage
invariants:
  - src/core stays pure — no fetch, no document, no vscode
  - ImportedSurfaceProvider remains the only Exact seam (CDN is web-host only)
  - Default estimate path loads no engine
  - Exact fail-closed without provider
  - Exact this ship remounts/reweights only — does not re-index graph topology
open_questions:
  - Band chrome grammar when some edges Exact and some estimate in one chart
  - Whether user-pinned typescript@x.y.z lives in UI settings or localStorage only
  - When Program-informed import topology is worth a second index pass
related:
  - dual-host-shell-stage
  - segmented-relative-path-labels
realized_by: []
superseded_by: null
rationale_quality: full
---

# Exact surface mode — landed on-ramp + futures checklist

Ship plan (lazy Exact / engine load): **web host on-ramp landed** — default
estimate stays offline; Precision → Exact **or** Weight → Imported LOC (Shaken)
loads TypeScript (inject → local → jsDelivr `@latest` → unpkg `@latest`), builds
a Program-backed `ImportedSurfaceProvider`, and **reprojects + remounts** (no
`buildGraph` re-index). Mixed-language zips get a warning; unsupported languages
stay estimate-honest.

## Landed (this vertical)

| Piece | Notes |
| ----- | ----- |
| `requiredEngines(graph)` | Pure language → engine map; only `typescript` loadable |
| `edgeWeight` exact mass | `targetSurfaceMass`; null → 1 (never whole-file under exact) |
| Web loader | inject / local / jsDelivr / unpkg |
| TS Program provider | Coarse export-span mass + optional inspect surface |
| Dual UI entry | Exact precision **or** Shaken weight → same surface mode |
| Provider inject | `globalThis.__ARCH_ATLAS_SURFACE__` / `__ARCH_ATLAS_TS__` skip CDN |

## Futures (do not implement from this entry alone)

Checklist of **advisory** follow-ups from Gate A / plan:

1. **Mixed Exact/estimate band + label UI** — multi-lang zips need chrome so
   users can see which bands are surface-exact vs whole-file estimate.
2. **User-pinned engine version** — today `typescript@latest`; later UI/setting
   to pin `typescript@x.y.z` (catalog only until product asks).
3. **Multi-language engines** — pyright / gopls / … when loadable; extend
   `engineMap` + host loaders; browser multi-LSP remains weak (prefer extension).
4. **Full LSP JSON-RPC in tab** — optional; Program/provider preferred for
   JS/TS Exact mass.
5. **VS Code extension Exact inject** — host language features → same
   `ImportedSurfaceProvider` (no CDN). Must not couple Exact consumers to
   CDN-only APIs.
6. **Program-informed re-index** — if Program improves import/export topology,
   optional re-`buildGraph` under Exact (not mass-only remount).
7. **Progressive stage / `src/stage`** — dual-host extract (see
   `dual-host-shell-stage`); orthogonal to Exact mass.

## Explicitly not product direction this ship

- Self-hosting CDN on product origin
- Perfect monorepo / full `node_modules` types for ZIP (stay honest null mass)
