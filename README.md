# Arch Atlas

Local-first architecture compiler: upload a repository (ZIP), receive an
**explorable architectural atlas**. Alluvial diagrams are the signature visual;
the durable core is a normalized semantic graph plus suggested views.

Source stays on-device — analysis is browser/local-first for TypeScript and
JavaScript (Level-1: files, imports, packages).

## Status

**MVP vertical slice (Level-1).** Upload a TS/JS ZIP → file tree + map catalog
(starts/ends, hotspots, file LOC, **blast radius**, suggested views) → file-hub
traversal alluvial (catalog only picks the start file). Stack: **Astro +
TypeScript**, pure core under `src/core/`, client index in `src/client/`.

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
(reverse-blast demo). Fixtures live under `fixtures/demo-react-simple/`,
`fixtures/demo-next-complex/`, and `fixtures/demo-spaghetti-godfile/` (plus the
older `fixtures/sample-ts-project/`). Optional localStorage remember keeps the
session across refresh; **Clear session** resets.

```bash
npm test    # pure core unit tests
npm run build
```

## Agent CLI (local lens)

Third host over pure core: directory or ZIP → JSON (no raw source). Same
Level-1 **Estimate** honesty as the web app (static JS/TS import graph; not
LSP / not tree-shake). Schemas: `arch-atlas.agent-digest.v1`,
`arch-atlas.agent-tree.v1`, `arch-atlas.agent-file.v1`.

```bash
# via npm script (recommended in-repo)
npm run atlas -- digest <dir|zip> [--limit N] [--max-depth N] [--omit GLOB]… [--out file.json]
npm run atlas -- tree   <dir|zip> [--max-depth N] [--omit GLOB]… [--out file.json]
npm run atlas -- file   <dir|zip> --file <relpath> [--limit N] [--max-depth N] [--omit GLOB]… [--out file.json]

# after npm install: package bin (src/cli/bin.mjs → tsx main.ts)
npx arch-atlas digest .
npx arch-atlas --help

# product-only self-scan (drop demo fixtures that otherwise dominate starts/views)
npm run atlas -- digest . --omit fixtures --out product.json
# equivalent globs:
npm run atlas -- digest . --omit=**/fixtures --omit=**/fixtures/**
npm run atlas -- digest . --omit '**/*.test.ts' --omit fixtures
```

| Flag | Meaning |
| ---- | ------- |
| `--limit N` | Top-N catalog ranking bins (digest/file). Default **40**. |
| `--max-depth N` | Max path segments from walk root (directory feeds). Default **24**; `0` or negative = unlimited. |
| `--omit GLOB` | Drop relative paths matching a **picomatch** glob (repeatable; comma-lists OK). Bare names match that segment anywhere (`fixtures` → whole `fixtures/**` tree). Applies to dir walks and ZIP entries. |
| `--file <rel>` | Relative path inside the project (**required** for `file`). |
| `--out <path>` | Write JSON to file instead of stdout. |
| `-h`, `--help` | Usage. |

Directory walks skip `node_modules`, `.git`, dist, etc. (`shouldIgnorePath`) and
non-text paths (`isTextPath`); depth overruns and `--omit` hits emit warnings.
Path alone without a subcommand defaults to `digest`. Implementation: `src/cli/`
+ pure builders in `src/core/export/agentDigest.ts`.

## Product sketch

```text
ZIP/files → language parsers → normalized graph → catalog / starts → alluvial views
```

Open on a **map catalog** (detected languages + generated views), not a blank
canvas. See [.grok/reference/scope.md](.grok/reference/scope.md) and
[.grok/reference/conversation.md](.grok/reference/conversation.md).

### Analysis honesty ladder

Full contract: [.grok/reference/analysis-honesty.md](.grok/reference/analysis-honesty.md)
(catalog memory: `analysis-capability-honesty`).

| Tier | What it is | What it is not |
| ---- | ---------- | -------------- |
| **Estimate** | Level-1 static **JS/TS** import graph + estimate mass (fuzzy by design) | Type-aware resolve, multi-lang imports, symbols/calls |
| **Exact (export surface)** | Match import bindings → **export declarations** via classic TS `createSourceFile` (or text); reweight + inspect only | Language server / LSP protocol, full typecheck, bundler tree-shake, graph re-index |
| **VS Code host** (future) | Same provider port; workspace + real language features / multi-LSP *possible* | Free “full LSP + tree-shake” without more product work |

Exact may auto-enable when local classic TS is available; otherwise Precision →
Exact or Weight → export surface loads the engine (local / CDN `@latest` /
inject). Non-JS languages stay estimate-honest.

### What Level-1 does (and does not)

| Does | Does not |
| ---- | -------- |
| Unpack ZIP in-browser (`fflate`) | Upload source to a remote analyzer |
| Static import/require/export edges (JS/TS) | Type-aware resolution / LSP protocol |
| `tsconfig` `paths` / `baseUrl` (best-effort) | Full monorepo workspace semantics |
| Inferred entrypoints + package ends | Call graph, symbols, DB entities |
| Catalog heuristics: reverse blast radius (import consumers) | Full framework adapters / agent loss function / topology-diff / godfile classifier |
| Weight axes (edges / importer LOC / **estimated** target file LOC; hub reverse uses importer LOC under Imported LOC) | Multi-language Exact engines; Program topology re-index |
| Optional **Exact export-surface** mass + inspect (named/default export spans; not whole-file under Exact when surface resolves) | Full type-checker / LanguageService / bundler tree-shake |
| Inspect: import line + export-surface excerpt (Exact) or whole-file (estimate) | Type-checked references; multi-language Exact |
| Carbon alluvial projection | Progressive stage-insert UX (later) |

## Layout

| Area | Path |
| ---- | ---- |
| Graph / parse / catalog / views | `src/core/` |
| Agent CLI host | `src/cli/` (`npm run atlas` / bin `arch-atlas`) |
| Client workspace controller | `src/client/app.ts` |
| Carbon wrappers | `src/components/ui/` |
| Shell + theme (zinc/teal) | `src/layouts/`, `src/styles/` |
| Sample fixtures | `fixtures/demo-*`, `fixtures/sample-ts-project/` |

## Agents

See [AGENTS.md](AGENTS.md). Global Grok roles load from
`~/git-personal/dotfiles/grok/skills/`; this repo only keeps the `.grok` overlay.
