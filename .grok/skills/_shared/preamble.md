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
- Stack: **Astro + TypeScript**; Level-1 pure core in `src/core/`; pure shell in `src/shell/` (`@shell`); alluvial stage in `src/stage/` (`@stage` - Carbon mount/polish/focus); web host in `src/client/` (composition root + paint modules); agent CLI host in `src/cli/` (`npm run atlas` / bin `arch-atlas` - dir|zip → agent JSON, no raw source; **digest defaults Exact** mass, topology Estimate). Later: Tree-sitter WASM, workers, OPFS/IndexedDB (planned). **`extension/` not landed** (dual-host partial - shell + stage web-in-process + CLI injector; VS Code still open)
- Product: **Local-first architecture compiler** - ZIP/files → normalized semantic graph → catalog/heuristics → suggested alluvial atlas views (source stays on-device)
- Design language: track **Sentinel** (Carbon UI wrappers, zinc/**teal** brand shell, alluvial as signature chart) - visual/UX grammar only; do not import Sentinel domain
- Mode: local `npm run dev` (Astro static + client index); no remote source upload
- Agent hub: [AGENTS.md](../../../AGENTS.md)

### Shell cwd trap (verify before git / npm / catalog)

Shell sessions may open in a **sibling or unrelated repo** (often
`~/git-personal/dotfiles` or another checkout under the same parent) even when
the session workspace is **arch-atlas**. File tools that take absolute or
workspace paths can still hit the right tree while `pwd` is wrong - so relative
`git`, `npm`, and `catalog-index` will mutate the wrong repo.

Before any repo-scoped shell work:

1. `pwd` and `git rev-parse --show-toplevel`
2. Confirm the toplevel is **this** repo (name/path ends with `arch-atlas`, or
   matches Workspace Path from session `user_info`)
3. If wrong: look under the **parent directory** of the mistaken cwd (e.g.
   `../arch-atlas` from `~/git-personal/<other>`), or use the absolute workspace
   path; then `cd` there (or pass absolute paths / `git -C <arch-atlas-root>`)
4. Do not commit, regenerate indexes, or run product scripts until cwd is correct

This is **not** the same as a `/ship` worktree/branch mismatch - that is still
“stop and report.” Wrong-sibling-repo cwd: **relocate**, then continue.

- Scope: [reference/scope.md](../../reference/scope.md)
- Vision notes: [reference/conversation.md](../../reference/conversation.md)
- Hub alluvial matrix (file-hub): [reference/hub-alluvial-behavior.md](../../reference/hub-alluvial-behavior.md) - **respect when changing alluvial**; surgical column/link fixes only; do not retcon the matrix to cascade side effects
- Package-hub geometry: [reference/hub-package-hub-behavior.md](../../reference/hub-package-hub-behavior.md) - Export hop\* → Exports → External; package open mounts package-hub (not file-hub on primary importer)
- Hub alluvial field notes: [reference/hub-alluvial-field-notes.md](../../reference/hub-alluvial-field-notes.md) - try/fail journal (Carbon free-source, residual, straighten cross-product, terminators); not product law
- Hub focus matrix: [reference/hub-focus-behavior.md](../../reference/hub-focus-behavior.md) - hover + sticky package FocusPlan (logical graph ≠ Carbon sourceLinks); selection chrome ≠ FocusPlan; do not rewrite pads for focus
- **Analysis protocol (canonical):** [reference/analysis-protocol.md](../../reference/analysis-protocol.md) - L0–L4 multi-host direction; phases P0–P6
- Analysis honesty (current Exact): [reference/analysis-honesty.md](../../reference/analysis-honesty.md)

## Product contracts (draft - from design conversation)

1. **Local-first analysis** - source code stays on-device; optional export is only a sanitized graph, never raw source by default.
2. **Normalized graph is the durable core** - nodes/edges first; alluvials and map-catalog views are **projections**, not the storage model.
3. **Epistemic layers stay distinct** - **Observed** (AST/import proof) vs **Inferred** (classifiers) vs **Declared** (user corrections). Corrections propagate across projections.
4. **Suggested toolkit, not blank canvas** - detect stack → offer useful views (API surface, route→DB, externals, god-files, layer violations, …). Users should not design Sankey stages from scratch.
5. **Framework adapters are first-class** - detect, classify, enrich, suggestViews, inspect; imperfect analysis is OK when confidence is honest.
6. **Capability ladder** - ship useful L1 before L3; stamp capabilities that actually ran ([analysis-protocol.md](../../reference/analysis-protocol.md)).
7. **One analyzer protocol, multi-host** - browser / CLI / VS Code share CodeGraph IR; CLI is Program reference home; no three independent analyzers.
8. **Minimal invention** - do not invent product features beyond confirmed intent in scope/conversation/protocol.
9. **Provisional layout** - file paths are current materialization until labeled invariant.

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
        ↓
  src/stage (Carbon alluvial mount / polish / focus) ← web host injectors
```

Underlying structure is a **directed graph** (shared helpers merge bands); rooted
route views may look tree-like but must not assume a true tree.

**Layout (current):** `src/core` (engine) · `src/shell` (pure session/nav) ·
`src/stage` (DOM alluvial, landed web-in-process) · `src/client` (web injector) ·
`src/cli` (agent CLI injector). `extension/` (VS Code host) still **not landed**.

## Conventions

- Minimal diffs; no drive-by refactors.
- Match existing naming, file placement, and abstraction level once a house style
  appears.
- Prefer pure modules for graph/core logic (testable without Astro).
- Prefer fixtures/mocks over network for anything unit-testable.
- Do not invent CI or npm scripts that are not in `package.json`.
- When adding UI chrome, prefer Sentinel-like Carbon wrapper discipline (no raw
  `cds-*` in pages once wrappers exist) and zinc/emerald brand shell.

### State-docs ban

Do **not** leave project-state narrative, active-plan docs, or README Status /
Roadmap / Progress sections outside **`.grok/pm/NOW.md`**,
**`.grok/reference/roadmap.md`**, and **`.grok/catalog/entries/*`**.
**Carve-out:** honest shipped-behavior, contracts, and how-to docs. Intent
mid-work belongs in the assumption gate / commit body - not new status
markdown. Orientation SoR is [`.grok/pm/NOW.md`](../../pm/NOW.md) when present.

### Resist AI helper accretion

Semantic domain names do **not** make structurally identical code distinct.
Prefer a flatter, smaller generic surface when behavior is genuinely shared.

## Playbook index

| Resource                                                                   | When to load                                                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [AGENTS.md](../../../AGENTS.md)                                            | Agent entry, roles, scripts                                                             |
| [scope.md](../../reference/scope.md)                                       | Product intent, draft contracts, views ladder                                           |
| [conversation.md](../../reference/conversation.md)                         | Full design conversation notes                                                          |
| [hub-alluvial-behavior.md](../../reference/hub-alluvial-behavior.md)       | File-hub columns, mass, pads; **before any alluvial/hub change**                        |
| [hub-package-hub-behavior.md](../../reference/hub-package-hub-behavior.md) | Package-hub columns (Export\* → External); package open policy vs sticky FocusSeed      |
| [hub-alluvial-field-notes.md](../../reference/hub-alluvial-field-notes.md) | Scar tissue: diagnosis table + episode log for alluvial/Carbon mishaps                  |
| [hub-focus-behavior.md](../../reference/hub-focus-behavior.md)             | Hub hover + sticky package FocusPlan (LogicalFocusGraph); orthogonal to column matrices |
| [analysis-protocol.md](../../reference/analysis-protocol.md)               | **Canonical** multi-host L0–L4 analyzer direction + ship phases                         |
| [analysis-honesty.md](../../reference/analysis-honesty.md)                 | Estimate vs Exact export surface vs VS Code **today** - do not claim LSP/tree-shake     |
| [impact-cheatsheet.md](../../reference/impact-cheatsheet.md)               | Two-ref import-topology impact CLI; large-JSON read order; research/czar recipes        |
| [cycles-cheatsheet.md](../../reference/cycles-cheatsheet.md)               | Circular import chains: `digest` SCCs vs `mermaid` honesty; caps + read order           |
| [git-commits.md](../git-commits.md)                                        | Before any commit                                                                       |
| `~/git-personal/dotfiles/grok/skills/_shared/personality.md`               | Global agent personality                                                                |

### Code areas

| Area                    | Path / focus                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Astro app shell         | `src/pages/`, `src/layouts/`                                                                                                                                                                     |
| Graph / parse / catalog | `src/core/` (pure TS; Vitest); agent builders in `export/agentDigest.ts`, `export/agentImpact.ts`, `export/agentMermaid.ts`                                                                      |
| Host-shared Exact       | `src/exact/` (`@exact`) - export-surface load/provider; CDN fetch OK here, not in pure core                                                                                                      |
| Pure shell              | `src/shell/` (`@shell`) - session/nav predicates, captions, payload project, control parsers; no document/Carbon/chart                                                                           |
| Alluvial stage          | `src/stage/` (`@stage`) - `createAlluvialStage`, `polish/`, `focus/`, drill/carbonEvents/height; owns `@carbon/charts`                                                                           |
| Web client workspace    | `src/client/` - `app.ts` composition root (host injectors, nav commit, `wireUi`); paint: `dom.ts`, `renderTree.ts`, `renderCatalog.ts`, `inspectModal.ts`, `exactPaintMode.ts` - no Carbon/chart |
| Agent CLI host          | `src/cli/` - `loadFeed` (dir/ZIP), `loadGitRef` (git archive), `digest` / `tree` / `file` / `mermaid` / `impact` → agent JSON or Mermaid text; Exact via `@exact`                                |
| VS Code host (target)   | `extension/` - **not landed**                                                                                                                                                                    |
| Framework adapters      | _(TBD - L1 uses start/end heuristics only)_                                                                                                                                                      |
| UI / Carbon wrappers    | `src/components/ui/`, `src/styles/`                                                                                                                                                              |

## Commands

| Command                                                  | Purpose                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                            | Astro dev server                                                                                                                                                                                                                                                                                                                                |
| `npm run build`                                          | Production build                                                                                                                                                                                                                                                                                                                                |
| `npm run preview`                                        | Preview production build                                                                                                                                                                                                                                                                                                                        |
| `npm test`                                               | Vitest (core unit tests)                                                                                                                                                                                                                                                                                                                        |
| `npm run astro`                                          | Astro CLI passthrough                                                                                                                                                                                                                                                                                                                           |
| `npm run atlas -- digest\|tree\|file\|mermaid\|impact …` | Agent CLI lens (dir/ZIP or two git refs → agent JSON; mermaid → plain flowchart text; digest Exact-default; see README)                                                                                                                                                                                                                         |
| `npm run atlas -- mermaid <dir\|zip> …`                  | Structure graph export: default topFolder dependency rollup + file SCC `%%` comments; `--containment` emits indexed folder/file hierarchy without edges/SCCs (default presentation=summary; `--tree-full` for full leaves). Dependency mode is cycle **honesty**, not full audit - [cycles-cheatsheet.md](../../reference/cycles-cheatsheet.md) |
| `npm run atlas -- impact . --base <ref> --head <ref>`    | Import-topology impact; cheatsheet [impact-cheatsheet.md](../../reference/impact-cheatsheet.md)                                                                                                                                                                                                                                                 |
| `arch-atlas` (bin)                                       | Same as `npm run atlas` via `src/cli/bin.mjs`                                                                                                                                                                                                                                                                                                   |

If a command is not in `package.json`, do not invent CI that depends on it -
implement or skip with an explicit note.

## Commit rules

All roles that commit must follow [git-commits.md](../git-commits.md).  
Don't make new branches or push unless told.
