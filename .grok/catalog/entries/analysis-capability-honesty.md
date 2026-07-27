---
id: analysis-capability-honesty
kind: decision
state: active
authority: advisory
provenance: mixed

scope:
  - estimate
  - exact-mode
  - imported-surface
  - dual-host
  - vscode-extension
  - weight-axis
  - inspect
  - epistemic-honesty
applies_when:
  - Exact or Estimate precision UX copy
  - Imported LOC or Shaken weight labels
  - claiming LSP or language server in product
  - tree-shake or imported surface mass claims
  - public mass / iceberg / spine catalog bins
  - VS Code extension Exact / multi-language plans
  - inspect imported-code honesty
  - README or scope analysis capability docs
touches:
  - src/core/view/weight.ts
  - src/core/view/importedSurface.ts
  - src/core/view/inspect.ts
  - src/core/catalog/massBins.ts
  - src/core/catalog/spines.ts
  - src/core/export/agentDigest.ts
  - src/client/exact/
  - src/client/app.ts
  - src/client/inspectModal.ts
  - src/pages/index.astro
  - README.md
  - .grok/reference/analysis-honesty.md
  - exact-surface-mode-futures
  - dual-host-shell-stage
invariants:
  - Estimate is Level-1 static JS/TS import topology + estimate mass — not type-aware
  - In-tab Exact is export-declaration surface via classic createSourceFile (or text) — not LSP
  - Exact does not re-index graph topology
  - Map catalog File LOC remains whole-file; public mass / icebergs are Exact surface-ratio overlays only
  - Spines are observed topology + formula chooser (not Exact mass, not basename classifiers)
  - VS Code host can offer real language features / multi-LSP as platform — not free tree-shake
  - UI must not claim full LSP or bundler tree-shake for current Exact
  - Fail-closed: no silent whole-file under Exact forward surface mass
open_questions:
  - Whether Precision dropdown should drop the word Exact for Export surface only
  - Band chrome when multi-lang mixes estimate and Exact edges
related:
  - exact-surface-mode-futures
  - dual-host-shell-stage
  - segmented-relative-path-labels
realized_by:
  - .grok/reference/analysis-honesty.md
  - README.md
superseded_by: null
rationale_quality: full
---

# Analysis capability honesty (Estimate / Exact / VS Code)

Validated product memory (conversation + implemented stack). **Advisory** —
encode in UI/docs; do not treat as permission to overclaim engines.

## Problem

UI and short labels drift toward “LSP,” “Program,” and “tree-shaken” while the
web Exact path is **export-span matching on a Level-1 import graph**. Estimate is
correctly coarse but under-documented. VS Code is imagined as full LSP + shake.

## Intent

One durable ladder so agents and UI copy stay honest:

| Tier | Name | What it is |
| ---- | ---- | ---------- |
| 0 | **Estimate** | Fuzzy Level-1 static JS/TS import graph + estimate mass |
| 1 | **Exact (in-tab)** | Export-declaration surface mass/inspect for JS/TS — **close**, not LSP |
| 2 | **VS Code host** | Better host: workspace FS, inject provider, real language features / multi-LSP *possible* |
| 3 | **Honest imported surface** (future) | Program/checker re-exports, usage, type-only — still not bundler |
| 4 | **True tree-shake / shipped cost** (future) | Bundler or used-export closure — **not** “turn on LSP” |

## Reasoning (validated)

1. **Estimate** — `extractImports` + resolve rules; whole-file / dual-side
   importer LOC; JS/TS parse only; other langs shown unsupported.
2. **In-tab Exact** — classic `createSourceFile` export spans ↔ import bindings;
   same graph; remount only; CDN/local/inject loader.
3. **VS Code** — buys host power (workspace, tsserver/language features,
   multi-lang extensions). Does **not** automatically deliver product Exact
   policy or tree-shake; we still implement `ImportedSurfaceProvider` mapping.
4. **Tree-shake** — LSP/references ≠ bundler tree-shake. Requires separate
   analysis even on extension host.

## What each tier gets right / misrepresents / misses

See [analysis-honesty.md](../../reference/analysis-honesty.md) for the full
scorecard (kept in reference so product docs and agents share one table).

## Rejected alternatives + why

| Alt | Why not |
| --- | ------- |
| Call Exact “LSP mode” in UI | No LSP protocol or language server session |
| Call Exact “tree-shaken” without qualifier | Export-span only, not usage/bundler shake |
| Assume VS Code = full shake free | Platform only; surface policy still ours |
| Re-index graph whenever Exact loads | Topology stays Level-1 until a deliberate Program topology ship |

## Open questions

- Precision control label: keep “Exact” vs rename to “Export surface”
- Whether status bar should always show engine source (local / CDN / inject)
- Mixed-language band chrome (also in `exact-surface-mode-futures`)

## Revisit when

- Full `createProgram` / LanguageService ships for mass
- Extension host Exact inject lands
- Bundler-based cost analysis is product-requested
- Multi-language Exact engines land
