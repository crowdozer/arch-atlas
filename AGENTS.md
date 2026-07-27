# Agent guide (Arch Atlas)

Local-first architecture compiler: ZIP/files → normalized semantic graph →
framework adapters → suggested alluvial atlas views (source stays on-device).

Agents: start here, then load playbooks from the preamble.

## Start here

1. [README.md](README.md) — what this is and how to run it
2. [.grok/reference/scope.md](.grok/reference/scope.md) — product intent, draft contracts
3. [.grok/reference/conversation.md](.grok/reference/conversation.md) — design conversation (source vision)
4. Project overlay: [.grok/skills/_shared/preamble.md](.grok/skills/_shared/preamble.md)
5. **Hub alluvial work:** [.grok/reference/hub-alluvial-behavior.md](.grok/reference/hub-alluvial-behavior.md) — column / mass matrix; **surgical fixes only** (do not rewrite the matrix to match cascade drift)
6. **Hub alluvial field notes:** [.grok/reference/hub-alluvial-field-notes.md](.grok/reference/hub-alluvial-field-notes.md) — try/fail log (Carbon geometry, pads, straighten, terminators); diagnose before retconning
7. **Hub focus / highlight:** [.grok/reference/hub-focus-behavior.md](.grok/reference/hub-focus-behavior.md) — LogicalFocusGraph FocusPlan (band-only, file reverse∪forward, package reverse-path); orthogonal to geometry matrix
8. **Analysis honesty (Estimate / Exact / VS Code):** [.grok/reference/analysis-honesty.md](.grok/reference/analysis-honesty.md) — do not claim LSP or bundler tree-shake for in-tab Exact

## Role skills

**Global base** (process / personality / ship loop) lives in
`~/git-personal/dotfiles/grok/skills/` via `~/.grok/config.toml` `[skills].paths`.
This repo does **not** fork `engineer` / `czar` / `docu` / `research` / `ship`.

| Command | Role |
| ------- | ---- |
| `/engineer` | Implementation |
| `/czar` | Review branch, test gates, recommend merge |
| `/docu` | Docs only — reference, overlays, README, AGENTS |
| `/research` | Read-only codebase questions |
| `/ship` | End-to-end: research → plan → engineer → czar → docs |
| `/catalog` | Register design memory under `.grok/catalog/entries/` |
| `/redeploy` | Optional Vercel no-op bump |

| Overlay (repo) | Purpose |
| -------------- | ------- |
| [.grok/skills/_shared/preamble.md](.grok/skills/_shared/preamble.md) | Stack, contracts, playbook index |
| [.grok/skills/git-commits.md](.grok/skills/git-commits.md) | Commit **scopes** for this repo |

Commits: [.grok/skills/git-commits.md](.grok/skills/git-commits.md)

## Scripts (common)

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Astro dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Vitest core unit tests |
| `npm run astro` | Astro CLI passthrough |
| `npm run atlas -- <cmd> …` | Agent CLI lens (`digest` / `tree` / `file`; see README) |
| `arch-atlas` (bin) | Same CLI via `package.json` bin → `src/cli/bin.mjs` |

## Code areas (current layout)

| Area | Path / focus |
| ---- | ------------ |
| Graph / parse / catalog | `src/core/` (pure TS; Vitest) — agent JSON builders in `export/agentDigest.ts` |
| Host-shared Exact | `src/exact/` via `@exact` — export-surface engine load + provider (CDN/local OK); **not** pure core; CLI + web share this |
| Agent CLI host | `src/cli/` — dir/ZIP feed + `digest`/`tree`/`file` JSON lens; Exact via `@exact` (no `src/client/` imports) |
| Pure shell (nav, captions, project, controls) | `src/shell/` via `@shell` — no DOM/Carbon/chart |
| Alluvial stage | `src/stage/` via `@stage` — Carbon mount (`createAlluvialStage`), `polish/`, `focus/`, drill/clicks/height |
| Web client workspace | `src/client/` — composition root `app.ts` (host injectors + nav + `wireUi`); paint: `dom.ts`, `renderTree.ts`, `renderCatalog.ts`, `inspectModal.ts`, `exactPaintMode.ts`, `wireUi.ts` — no `@carbon/charts` |
| Astro app shell | `src/pages/`, `src/layouts/` |
| UI / Carbon | `src/components/ui/`, `src/styles/` |

**Hosts:** web (`src/client/`) + agent CLI (`src/cli/`) landed. **Not yet landed:**
`extension/` (VS Code host). Dual-host plan remains **partial** — shell + stage
web-in-process + CLI injector; extension / webview message loop not. See
[dual-host-shell-stage](.grok/catalog/entries/dual-host-shell-stage.md).

## How to treat this repo

This repository is a **working hypothesis**. Confirmed product intent and labeled
invariants win over provisional file layout. See global personality in
`~/git-personal/dotfiles/grok/skills/_shared/personality.md`.

**UI design language:** track **Sentinel** (Carbon wrappers, zinc/**teal** shell,
alluvial/Sankey as signature visual; **purple** = active selection) — do not fork
Sentinel product domain or copy wholesale; re-home the visual/UX grammar here as needed.
