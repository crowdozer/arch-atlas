# Agent guide (Arch Atlas)

Local-first architecture compiler: ZIP/files → normalized semantic graph →
framework adapters → suggested alluvial atlas views (source stays on-device).

Agents: start here, then load playbooks from the preamble.

## Start here

1. [README.md](README.md) — what this is and how to run it
2. [.grok/reference/scope.md](.grok/reference/scope.md) — product intent, draft contracts
3. [.grok/reference/conversation.md](.grok/reference/conversation.md) — design conversation (source vision)
4. Project overlay: [.grok/skills/_shared/preamble.md](.grok/skills/_shared/preamble.md)
5. **Hub alluvial work (file-hub):** [.grok/reference/hub-alluvial-behavior.md](.grok/reference/hub-alluvial-behavior.md) — column / mass matrix; **surgical fixes only** (do not rewrite the matrix to match cascade drift)
6. **Package-hub geometry:** [.grok/reference/hub-package-hub-behavior.md](.grok/reference/hub-package-hub-behavior.md) — Export hop\* → Exports → External; package open is package-hub (not file-hub on primary importer)
7. **Hub alluvial field notes:** [.grok/reference/hub-alluvial-field-notes.md](.grok/reference/hub-alluvial-field-notes.md) — try/fail log (Carbon geometry, pads, straighten, terminators); diagnose before retconning
8. **Hub focus / highlight:** [.grok/reference/hub-focus-behavior.md](.grok/reference/hub-focus-behavior.md) — LogicalFocusGraph FocusPlan (band-only, file reverse∪forward, package reverse-path + sticky open seed); selection chrome ≠ FocusPlan; orthogonal to geometry matrices
9. **Analysis protocol (canonical multi-host L0–L4):** [.grok/reference/analysis-protocol.md](.grok/reference/analysis-protocol.md) — one IR, capability stamps, ship phases; catalog [analysis-protocol-multi-host](.grok/catalog/entries/analysis-protocol-multi-host.md)
10. **Analysis honesty (Estimate / Exact / VS Code today):** [.grok/reference/analysis-honesty.md](.grok/reference/analysis-honesty.md) — do not claim LSP or bundler tree-shake; CLI digest Exact default is export-surface only (`surfaceLoc` ≠ public API)
11. **Impact CLI (topology delta):** [.grok/reference/impact-cheatsheet.md](.grok/reference/impact-cheatsheet.md) — two-ref import-graph impact; read order for large JSON; ship research / czar recipes
12. **Color / Carbon tokens:** [.grok/reference/carbon-tokens.md](.grok/reference/carbon-tokens.md) — zinc+teal brand (not emerald), purple selection, status CDS presets, g100 → bridge → `--atlas-*` → `chartPalette`

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
| `npm run atlas -- <cmd> …` | Agent CLI lens (`digest` / `tree` / `file` / `impact`; see README). **Digest defaults Exact** export-surface mass; optional **`--program`** / web Precision **Program** (worker) createProgram (`--estimate` opt-out; `--exact`/`--exact-local` fail-closed). Tree default is summary (`--tree-full` for leaves). |
| `npm run atlas -- impact . --base <ref> --head <ref> …` | Two-ref import-topology impact (`arch-atlas.agent-impact.v1`); cheatsheet: [.grok/reference/impact-cheatsheet.md](.grok/reference/impact-cheatsheet.md) |
| `arch-atlas` (bin) | Same CLI via `package.json` bin → `src/cli/bin.mjs` |

### Impact / atlas workflow (architecture-affecting ships)

Global role pack wires arch-atlas (soft-fail if missing): see
`~/git-personal/dotfiles/grok/skills/_shared/arch-atlas.md` and
[.grok/reference/impact-cheatsheet.md](.grok/reference/impact-cheatsheet.md).

- **Research:** architecture-heavy → `digest` and/or `impact` (e.g. `--base main --head HEAD --omit fixtures --out /tmp/atlas-impact.json`); **5–10 lines** via cheatsheet **read order** — never paste full JSON.
- **Czar:** after `git diff` stats, `impact` as **supplemental** topology signal (flow clobber / blast movers); not a merge gate alone; still run tests.
- **Engineer:** awareness only — not primary toolkit.
- **Confirmable CLI bugs:** `/catalog` in this repo (investigation + repro).

## Code areas (current layout)

| Area | Path / focus |
| ---- | ------------ |
| Graph / parse / catalog | `src/core/` (pure TS; Vitest) — agent JSON builders in `export/agentDigest.ts`, `export/agentImpact.ts` |
| Host-shared Exact | `src/exact/` via `@exact` — export-surface engine load + provider (CDN/local OK); **not** pure core; CLI + web share this |
| Agent CLI host | `src/cli/` — dir/ZIP feed + git-ref archive (`impact`) + `digest`/`tree`/`file`/`impact` JSON lens; Exact via `@exact` (no `src/client/` imports) |
| Pure shell (nav, captions, project, controls) | `src/shell/` via `@shell` — no DOM/Carbon/chart |
| Alluvial stage | `src/stage/` via `@stage` — Carbon mount (`createAlluvialStage`), `polish/`, `focus/`, drill/clicks/height |
| Web client workspace | `src/client/` — composition root `app.ts` (host injectors + nav + `wireUi`); paint: `dom.ts`, `renderTree.ts`, `renderCatalog.ts`, `inspectModal.ts`, `exactPaintMode.ts`, `sessionLifecycle.ts`, `wireUi.ts` — no `@carbon/charts` |
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
