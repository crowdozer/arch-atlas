# Agent guide (Arch Atlas)

Local-first architecture compiler: ZIP/files → normalized semantic graph →
framework adapters → suggested alluvial atlas views (source stays on-device).

Agents: start here, then load playbooks from the preamble.

## Start here

1. [README.md](README.md) — what this is and how to run it
2. [.grok/reference/scope.md](.grok/reference/scope.md) — product intent, draft contracts
3. [.grok/reference/conversation.md](.grok/reference/conversation.md) — design conversation (source vision)
4. Project overlay: [.grok/skills/_shared/preamble.md](.grok/skills/_shared/preamble.md)

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
| `npm run astro` | Astro CLI passthrough |

## How to treat this repo

This repository is a **working hypothesis**. Confirmed product intent and labeled
invariants win over provisional file layout. See global personality in
`~/git-personal/dotfiles/grok/skills/_shared/personality.md`.

**UI design language:** track **Sentinel** (Carbon wrappers, zinc/emerald shell,
alluvial/Sankey as signature visual) — do not fork Sentinel product domain or
copy wholesale; re-home the visual/UX grammar here as needed.
