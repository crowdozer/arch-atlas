# Arch Atlas role preamble (project overlay)

Shared **product** context for global roles `/czar`, `/engineer`, `/research`,
`/docu`, and `/ship` (role procedures live in
`~/git-personal/dotfiles/grok/skills/`; this file is loaded by those skills when
present).

**End-to-end pipeline:** `/ship <task>` orchestrates research → plan → engineer →
czar → docs (conditional). Human gates on plan approval and merge. Role skills
stay pure; ship only stitches them.

**Epistemic:** this repo is a **working hypothesis**. Contracts below start as
**draft** until confirmed. Stance:
`~/git-personal/dotfiles/grok/skills/_shared/personality.md`.

## Workspace

- Repo: **arch-atlas**
- Stack: **Astro + TypeScript**; Level-1 pure core in `src/core/`; client workspace in `src/client/`; later: Tree-sitter WASM, workers, OPFS/IndexedDB (planned)
- Product: **Local-first architecture compiler** — ZIP/files → normalized semantic graph → catalog/heuristics → suggested alluvial atlas views (source stays on-device)
- Design language: track **Sentinel** (Carbon UI wrappers, zinc/**teal** brand shell, alluvial as signature chart) — visual/UX grammar only; do not import Sentinel domain
- Mode: local `npm run dev` (Astro static + client index); no remote source upload
- Agent hub: [AGENTS.md](../../../AGENTS.md)
- Scope: [reference/scope.md](../../reference/scope.md)
- Vision notes: [reference/conversation.md](../../reference/conversation.md)
- Hub alluvial matrix: [reference/hub-alluvial-behavior.md](../../reference/hub-alluvial-behavior.md) — **respect when changing alluvial**; surgical column/link fixes only; do not retcon the matrix to cascade side effects

## Product contracts (draft — from design conversation)

1. **Local-first analysis** — source code stays on-device; optional export is only a sanitized graph, never raw source by default.
2. **Normalized graph is the durable core** — nodes/edges first; alluvials and map-catalog views are **projections**, not the storage model.
3. **Epistemic layers stay distinct** — **Observed** (AST/import proof) vs **Inferred** (classifiers) vs **Declared** (user corrections). Corrections propagate across projections.
4. **Suggested toolkit, not blank canvas** — detect stack → offer useful views (API surface, route→DB, externals, god-files, layer violations, …). Users should not design Sankey stages from scratch.
5. **Framework adapters are first-class** — detect, classify, enrich, suggestViews, inspect; imperfect analysis is OK when confidence is honest.
6. **Capability ladder** — ship useful Level 1 (files/imports/packages/routes) before deep call/DB/runtime semantics.
7. **Minimal invention** — do not invent product features beyond confirmed intent in scope/conversation.
8. **Provisional layout** — file paths are current materialization until labeled invariant.

## Architecture (target sketch)

```text
ZIP / files (browser)
        ↓
  parsers (Tree-sitter WASM, workers)
        ↓
  normalized CodeGraph (nodes + edges)
        ↓
  framework adapters (detect / classify / enrich / suggest / inspect)
        ↓
  map catalog → alluvial & other projections
```

Underlying structure is a **directed graph** (shared helpers merge bands); rooted
route views may look tree-like but must not assume a true tree.

## Conventions

- Minimal diffs; no drive-by refactors.
- Match existing naming, file placement, and abstraction level once a house style
  appears.
- Prefer pure modules for graph/core logic (testable without Astro).
- Prefer fixtures/mocks over network for anything unit-testable.
- Do not invent CI or npm scripts that are not in `package.json`.
- When adding UI chrome, prefer Sentinel-like Carbon wrapper discipline (no raw
  `cds-*` in pages once wrappers exist) and zinc/emerald brand shell.

### Resist AI helper accretion

Semantic domain names do **not** make structurally identical code distinct.
Prefer a flatter, smaller generic surface when behavior is genuinely shared.

## Playbook index

| Resource | When to load |
| -------- | ------------ |
| [AGENTS.md](../../../AGENTS.md) | Agent entry, roles, scripts |
| [scope.md](../../reference/scope.md) | Product intent, draft contracts, views ladder |
| [conversation.md](../../reference/conversation.md) | Full design conversation notes |
| [hub-alluvial-behavior.md](../../reference/hub-alluvial-behavior.md) | File-hub columns, mass, pads; **before any alluvial/hub change** |
| [git-commits.md](../git-commits.md) | Before any commit |
| `~/git-personal/dotfiles/grok/skills/_shared/personality.md` | Global agent personality |

### Code areas

| Area | Path / focus |
| ---- | ------------ |
| Astro app shell | `src/pages/`, `src/layouts/` |
| Graph / parse / catalog | `src/core/` (pure TS; Vitest) |
| Client workspace | `src/client/app.ts` |
| Framework adapters | _(TBD — L1 uses start/end heuristics only)_ |
| UI / Carbon / alluvial | `src/components/ui/`, `src/styles/`, `@carbon/charts` |

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Astro dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Vitest (core unit tests) |
| `npm run astro` | Astro CLI passthrough |

If a command is not in `package.json`, do not invent CI that depends on it —
implement or skip with an explicit note.

## Commit rules

All roles that commit must follow [git-commits.md](../git-commits.md).  
Don't make new branches or push unless told.
