# Arch Atlas

Local-first architecture compiler: upload a repository (ZIP), receive an
**explorable architectural atlas**. Alluvial diagrams are the signature visual;
the durable core is a normalized semantic graph plus suggested views.

Source stays on-device — analysis is browser/local-first for TypeScript and
JavaScript (Level-1: files, imports, packages).

## Status

**MVP vertical slice (Level-1).** Upload a TS/JS ZIP → file tree + map catalog
(starts/ends, hotspots, file LOC, **godfile candidates**, **blast radius**,
suggested views) → file-hub traversal alluvial (catalog only picks the start
file). Stack: **Astro + TypeScript**, pure core under `src/core/`, client index
in `src/client/`.

UI design language tracks **Sentinel** grammar (Carbon, zinc shell) with
**teal** interactive brand — not emerald.

## Setup

```bash
cd ~/git-personal/arch-atlas
npm install
npm run dev
```

Open the app and either drop a ZIP of a TS/JS project, or click a **built-in
demo**: React (low complexity), Next.js (high complexity), or **Spaghetti hub**
(godfile / reverse-blast demo). Fixtures live under
`fixtures/demo-react-simple/`, `fixtures/demo-next-complex/`, and
`fixtures/demo-spaghetti-godfile/` (plus the older
`fixtures/sample-ts-project/`). Optional localStorage remember keeps the session
across refresh; **Clear session** resets.

```bash
npm test    # pure core unit tests
npm run build
```

## Product sketch

```text
ZIP/files → language parsers → normalized graph → catalog / starts → alluvial views
```

Open on a **map catalog** (detected languages + generated views), not a blank
canvas. See [.grok/reference/scope.md](.grok/reference/scope.md) and
[.grok/reference/conversation.md](.grok/reference/conversation.md).

### What Level-1 does (and does not)

| Does | Does not |
| ---- | -------- |
| Unpack ZIP in-browser (`fflate`) | Upload source to a remote analyzer |
| Static import/require/export edges | Type-aware resolution / LSP |
| `tsconfig` `paths` / `baseUrl` (best-effort) | Full monorepo workspace semantics |
| Inferred entrypoints + package ends | Call graph, symbols, DB entities |
| Catalog heuristics: godfile candidates ((in+1)×(out+1)×domains×LOC) + reverse blast radius | Full framework adapters / agent loss function / topology-diff |
| Weight axes (edges / importer LOC / **estimated** target file LOC) | Exact tree-shaken imported LOC (Precision → Exact requires LSP — not implemented) |
| Inspect evidence (import + target excerpt + estimated callsites) | Type-checked references / multi-language exact surface |
| Carbon alluvial projection | Progressive stage-insert UX (later) |

## Layout

| Area | Path |
| ---- | ---- |
| Graph / parse / catalog / views | `src/core/` |
| Client workspace controller | `src/client/app.ts` |
| Carbon wrappers | `src/components/ui/` |
| Shell + theme (zinc/teal) | `src/layouts/`, `src/styles/` |
| Sample fixtures | `fixtures/demo-*`, `fixtures/sample-ts-project/` |

## Agents

See [AGENTS.md](AGENTS.md). Global Grok roles load from
`~/git-personal/dotfiles/grok/skills/`; this repo only keeps the `.grok` overlay.
