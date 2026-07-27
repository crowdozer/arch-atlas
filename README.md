# Arch Atlas

Local-first architecture compiler: upload a repository (ZIP), receive an
**explorable architectural atlas**. Alluvial diagrams are the signature visual;
the durable core is a normalized semantic graph plus suggested views.

Source stays on-device — analysis is browser/local-first for TypeScript and
JavaScript (Level-1: files, imports, packages).

## Status

**MVP vertical slice (Level-1).** Upload a TS/JS ZIP → file tree + map catalog
(starts/ends, hotspots, **file LOC** whole-file, **blast radius**, **spines**,
Exact-only **public mass** / **icebergs**, suggested views) → file-hub traversal
alluvial (catalog only picks the start file). Stack: **Astro + TypeScript**, pure
core under `src/core/`, client index in `src/client/`.

UI design language tracks **Sentinel** grammar (Carbon, zinc shell) with
**teal** interactive brand — not emerald.

## Setup

```bash
cd ~/git-personal/arch-atlas
npm install
npm run dev
```

Open the app and either drop a ZIP of a project, or click a **built-in demo**:
React (low complexity), Next.js (high complexity), **Spaghetti hub**
(reverse-blast), or **Python app** (Level-1 Estimate import graph). Fixtures
live under `fixtures/demo-react-simple/`, `fixtures/demo-next-complex/`,
`fixtures/demo-spaghetti-godfile/`, and `fixtures/demo-python-app/` (plus
`fixtures/sample-ts-project/` and `fixtures/sample-python-project/`). Optional
localStorage remember keeps the session across refresh; **Clear session** resets.

```bash
npm test    # pure core unit tests
npm run build
```

## Agent CLI (local lens)

Third host over pure core: directory or ZIP → JSON (no raw source). Level-1
static import graph (JS/TS + Python + Astro script islands); not LSP / not
tree-shake. **`digest` defaults Exact (export-surface mass)** when the engine
loads; topology bins stay Estimate either way. Schemas:
`arch-atlas.agent-digest.v1`, `arch-atlas.agent-tree.v1`,
`arch-atlas.agent-file.v1`, `arch-atlas.agent-impact.v1` (two git refs →
topology delta). Full honesty (current tiers):
[.grok/reference/analysis-honesty.md](.grok/reference/analysis-honesty.md).
**Multi-host capability direction (L0–L4, Program phases):**
[.grok/reference/analysis-protocol.md](.grok/reference/analysis-protocol.md).

```bash
# via npm script (recommended in-repo)
npm run atlas -- digest <dir|zip> [--limit N] [--max-depth N] [--omit GLOB]… [--estimate|--exact|--exact-local] [--out file.json]
npm run atlas -- tree   <dir|zip> [--max-depth N] [--omit GLOB]… [--tree-full] [--out file.json]
npm run atlas -- file   <dir|zip> --file <relpath> [--limit N] [--max-depth N] [--omit GLOB]… [--out file.json]
npm run atlas -- impact <git-repo> --base <ref> --head <ref> [--limit N] [--max-depth N] [--omit GLOB]… [--out file.json]

# after npm install: package bin (src/cli/bin.mjs → tsx main.ts)
npx arch-atlas digest .
npx arch-atlas --help

# product-only self-scan (drop demo fixtures that otherwise dominate starts/views)
npm run atlas -- digest . --omit fixtures --out product.json
# equivalent globs:
npm run atlas -- digest . --omit=**/fixtures --omit=**/fixtures/**
npm run atlas -- digest . --omit '**/*.test.ts' --omit fixtures

# estimate-only digest (opt out of default Exact mass)
npm run atlas -- digest . --omit fixtures --estimate --out runtime.json

# tree: default is summary directory rolls; full leaves on request
npm run atlas -- tree . --out /tmp/tree-summary.json
npm run atlas -- tree . --tree-full --out /tmp/tree-full.json

# import-topology impact of a commit / branch (git archive both sides; no dirty tree)
npm run atlas -- impact . --base HEAD^ --head HEAD --omit fixtures --out /tmp/impact.json
npm run atlas -- impact . --base main --head HEAD --omit fixtures --out /tmp/impact.json
```

| Flag | Meaning |
| ---- | ------- |
| `--limit N` | Top-N catalog ranking bins (digest/file); impact movers + edge samples. Default **40**. |
| `--max-depth N` | Max path segments from walk root (directory feeds). Default **24**; `0` or negative = unlimited. |
| `--omit GLOB` | Drop relative paths matching a **picomatch** glob (repeatable; comma-lists OK). Bare names match that segment anywhere (`fixtures` → whole `fixtures/**` tree). Applies to dir walks, ZIP entries, and git-archive feeds. Omitted targets that other files still import stamp `toKind: 'omitted'` (not `unresolved`). |
| `--alias P=T` | **Digest/tree/file/impact feed:** merge path alias rewrite (repeatable). Example: `@/modules/artillery/*=./*`. Stamped on `scope.aliasRewrites`. |
| `--scope full\|product` | Feed preset (default **full**). `product` drops tests + debug/scripts heuristics; stamps `scope.presets`. |
| `--base <ref>` / `--head <ref>` | **Required** for `impact`: git refs to compare (materialized via `git archive`). |
| `--estimate` | **Digest only:** skip Exact mass (estimate-only `fileLoc` / empty publicMass & icebergs). |
| `--exact` | **Digest only:** require Exact export-surface (**fail-closed** on engine error, exit 1). Loads classic TypeScript (`typescript-classic` locally, else jsDelivr, else unpkg). Graph topology bins unchanged. Not LSP / not tree-shake. On tree/file/impact: no mass overlay (warn if passed). |
| `--exact-local` | Like `--exact` but never uses CDN (local classic / inject only); also fail-closed. |
| `--tree-full` | **Tree only:** full verbose file leaves. Default tree mode is **summary** (directory rolls with `fileCount` / `sourceCount`; leaves only for small folders or deep paths). |
| `--file <rel>` | Relative path inside the project (**required** for `file`). |
| `--out <path>` | Write JSON to file instead of stdout. |
| `-h`, `--help` | Usage. |

### Digest Exact default

- **Default** for `digest`: try Exact export-surface mass. Soft-fallback if the
  engine cannot load → warning + estimate digest (exit **0**).
- **`--estimate`**: opt out (estimate-only mass).
- **`--exact` / `--exact-local`**: fail-closed (exit **1** on engine failure).
- **tree / file / impact**: topology-only (Exact mass never applied). Passing
  `--exact` only warns that Exact is digest mass.

Exact loads from **`@exact`** (`src/exact/`), shared with the web host — local
**`typescript-classic`** npm package first (TypeScript 5.x `createSourceFile`
under `node_modules/`), not a vendored `typescript.js`; else CDN (jsDelivr /
unpkg) unless `--exact-local`.

**Honesty:** Exact does **not** re-index the graph. `surfaceLoc` is
export-declaration **span** coverage, not public-API member surface. Web UI
Exact remains estimate-first / opt-in (CLI default does not flip web).

**Impact** (`arch-atlas.agent-impact.v1`): delta-first topology report (summary
delta, files/packages added/removed, edges added/removed, degree/blast movers).
No raw source; no dual digests. Large output → read order and recipes in
[.grok/reference/impact-cheatsheet.md](.grok/reference/impact-cheatsheet.md).

### Agent digest fields (high level)

Additive `arch-atlas.agent-digest.v1` fields agents should prefer:

| Field | Meaning |
| ----- | ------- |
| `scope` | Stamp: `omit`, `includeTests`, `exactRequested` / `exactApplied`, `feedKind` (`directory` \| `zip`). Also on `file` reports. |
| `catalog.entrypoints` / `catalog.roots` | Starts split: declared-ish entrypoints vs orphan roots. `catalog.starts` remains the merged list (entrypoints then roots). |
| `summary.externalPackageCount` | Alias of external `packageCount` (npm/external leaves — not monorepo package tally). |
| Graph edges `typeOnly` | Present when `import type` / `export type … from` (best-effort; `import { type X }` may still be value form). Ranking prefers runtime edges. |
| Edge `toKind: 'omitted'` | Target missing because feed `--omit`, not true unresolved. |
| Hotspot `rankScore` | Sort key after role adjustments (e.g. barrel demotion). Prefer over raw `edgeCount`. Dual degrees: edge-record `inDegree`/`outDegree` + unique `uniqueIn`/`uniqueOut`. |
| `exportDeclarationLoc` | Alias of Exact `surfaceLoc` (export-declaration span). Prefer this name in agents. Mass rows may stamp `surfaceSupport: 'supported'`. |
| `downwindReach` / `reverseReach` | Agent aliases of `complex` / `blastRadius` (same arrays). |
| `catalog.cycles` | `{ runtime, type }` SCC summaries (size ≥ 2). |
| `catalog.boundaryCrossings` | Inferred deep imports past barrel/façade folders. |
| Edge `unresolvedReason` | `alias` \| `missing` \| `external` when `toKind: unresolved`. |
| File `importsShown` / `importersShown` | Cap window length with totals + `truncated`. File `analysis.fileLens` stamps mass=false (topology-only). |
| Catalog `roles` | **Inferred** only (`test` / `debug` / `barrel` / `entrypoint` / `module`) — never observed topology. |
| File report neighbors | Arrays kept + `importsTotal` / `importersTotal` / `truncated` when capped by `--limit`. |

### Agent digest catalog bins

`digest` JSON includes the map-catalog ranking bins. Default CLI digest applies
Exact mass when available; `--estimate` keeps estimate mass. Exact is always an
export-surface **overlay** (not a graph re-index).

| Field | Estimate (`--estimate` or soft-fallback) | Exact applied (default digest) |
| ----- | ---------------------------------------- | ------------------------------ |
| `catalog.fileLoc` | Whole-file LOC ranking | Re-ranked by **export-surface** LOC (`analysis.locMetric: export-surface`) |
| `catalogEstimateFileLoc` | omitted | Whole-file File LOC retained for comparison |
| `catalog.publicMass` | `[]` | High surface/whole ratio (JS/TS only; zero-surface / debug paths gated) |
| `catalog.icebergs` | `[]` | Large private body under smaller surface (same gates) |
| `catalog.spines` | Topology ranking (+ `analysis.spineFormula`) | Same topology (formula stamp unchanged by Exact) |
| Other bins (starts, hotspots, blast, …) | Estimate graph + ranking honesty | Topology unchanged; ranking uses unique/runtime preference |

Spines answer cross-cutting fan-in / module diversity (formula chooser on web;
default `modules-then-in` in digest). Public mass and icebergs need Exact; File
LOC on the **web map catalog** stays whole-file even when Exact is on (Exact
splits “big surface” vs “private body” into the mass bins instead of rewriting
File LOC). When Exact is on, analysis may include `surfaceMetricNote`
(surfaceLoc ≠ public API). Full honesty ladder:
[.grok/reference/analysis-honesty.md](.grok/reference/analysis-honesty.md).

Directory walks skip `node_modules`, `.git`, dist, etc. (`shouldIgnorePath`) and
non-text paths (`isTextPath`); depth overruns and `--omit` hits emit warnings.
Path alone without a subcommand defaults to `digest`. Implementation: `src/cli/`
+ pure builders in `src/core/export/agentDigest.ts` and
`src/core/export/agentImpact.ts` (impact uses `src/cli/loadGitRef.ts`).

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
| Catalog: **File LOC** whole-file; Exact **public mass** / **icebergs** (surface ratio); **spines** (topology + formula) | Claiming mass bins are LSP/tree-shake; replacing File LOC with surface LOC on the web catalog |
| Inspect: import line + export-surface excerpt (Exact) or whole-file (estimate) | Type-checked references; multi-language Exact |
| Carbon alluvial projection | Progressive stage-insert UX (later) |

## Layout

| Area | Path |
| ---- | ---- |
| Graph / parse / catalog / views | `src/core/` (pure TS; agent JSON in `export/agentDigest.ts`) |
| Host-shared Exact | `src/exact/` (`@exact`) — export-surface engine (local classic / CDN); web + CLI share this; **not** pure core |
| Agent CLI host | `src/cli/` (`npm run atlas` / bin `arch-atlas`); Exact via `@exact` (no `src/client/` imports) |
| Pure shell (nav, captions, project, controls) | `src/shell/` (`@shell`) — no DOM/Carbon/chart |
| Alluvial stage | `src/stage/` (`@stage`) — Carbon mount, polish, focus, drill |
| Web client workspace | `src/client/` — thinned composition root `app.ts` (host injectors + nav + `wireUi`); paint: `dom.ts`, `renderTree.ts`, `renderCatalog.ts`, `inspectModal.ts`, `exactPaintMode.ts`, `wireUi.ts` — no `@carbon/charts` |
| Astro app shell / theme | `src/pages/`, `src/layouts/`, `src/styles/` (zinc/teal) |
| Carbon wrappers | `src/components/ui/` |
| Sample fixtures | `fixtures/demo-*`, `fixtures/sample-ts-project/` |

## Agents

See [AGENTS.md](AGENTS.md). Global Grok roles load from
`~/git-personal/dotfiles/grok/skills/`; this repo only keeps the `.grok` overlay.
