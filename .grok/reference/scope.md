# Arch Atlas — product & design scope

Agent-facing contract for what we are building. Starts **draft**; harden with
confirmed intent only. Vision source: [conversation.md](./conversation.md).

## Product in one sentence

**Upload a repository; receive an explorable architectural atlas** — a
local-first architecture compiler that turns a codebase into a normalized
semantic graph, then suggests useful projections (alluvial is the signature visual).

## Positioning

Not primarily “an alluvial dependency viewer.” The product is:

```text
ZIP/files → language parsers → normalized graph → framework classifiers → suggested views
```

The alluvial is signature UX language; the **inferred map catalog** prevents it
from becoming merely a prettier dependency graph.

## Status

| Phase | Focus | Status |
| ----- | ----- | ------ |
| **0** | Repo scaffold (Astro + `.grok`, AGENTS) | Done |
| **1** | Graph model + Level-1 static analysis (files, imports, packages) | **MVP done** (routes = file heuristics only) |
| **2** | Framework adapters + richer map catalog | Partial — catalog + first alluvial without full adapter interface; L1 reverse blast-radius catalog bin (not a full adapter `inspect`/findings interface; godfile classifier deferred) |
| **3** | Progressive expansion, weights, epistemic layers in UI | Partial — weight axes + estimate/exact gate + inspect evidence; progressive stage insert later |
| **4+** | Deeper adapters, optional runtime overlays, diff mode | Later |

## Core contracts (draft)

1. **Local-first** — parsing and graph build run in-browser/local (web) or on-device CLI; no source upload to remote servers by default. Optional export of a **sanitized graph** only (agent CLI: agent JSON schemas, no raw source).
2. **Graph is SoR** — durable model is nodes + edges; views are projections.
3. **Epistemic honesty** — Observed vs Inferred vs Declared stay distinct; user category corrections propagate.
4. **Suggested views** — adapters propose toolkits (API architecture, DB access, externals, god-files, layer violations, blast radius, …).
5. **Directed graph reality** — rooted route views may look tree-like; shared deps, cycles, dynamic imports mean alluvial merges matter.
6. **Capability ladder** — useful L1 before L3; **stamp what actually ran** ([analysis-protocol.md](./analysis-protocol.md)).
7. **One analyzer protocol, multiple hosts** — browser / CLI / VS Code share IR; no three independent analyzers ([analysis-protocol.md](./analysis-protocol.md)).
8. **Design language tracks Sentinel** — Carbon wrappers, zinc/**teal** shell (not emerald), alluvial/Sankey as signature; do not fork Sentinel product domain.

## Normalized graph (sketch)

```ts
// Conceptual — not yet implemented
type Node =
  | File
  | Symbol
  | Route
  | DatabaseEntity
  | ExternalService
  | Package
  | ArchitecturalCategory;

type Edge =
  | Imports
  | Calls
  | Exposes
  | Reads
  | Writes
  | Instantiates
  | Configures
  | DependsOn;
```

## Framework adapter (sketch)

```ts
// Conceptual — not yet implemented
interface FrameworkAdapter {
  detect(files: FileIndex): DetectionResult;
  classify(graph: CodeGraph): Classification[];
  enrich(graph: CodeGraph): GraphPatch;
  suggestViews(graph: CodeGraph): SuggestedView[];
  inspect(graph: CodeGraph): Finding[];
}
```

## Suggested views (examples)

| View | Projection idea |
| ---- | ---------------- |
| API architecture | Route → handler → service → capability |
| Database access | Route → module → ORM/model |
| External integrations | Route → client wrapper → provider |
| God-file candidates | High fan-in/fan-out files and symbols |
| Layer violations | Route/UI → database or vendor SDK directly |
| Shared infrastructure | Features → logging/cache/auth/config |
| Package surface | Feature → internal package → npm package |
| Blast radius | Selected file → reverse reachable routes/features |

## Interaction model (alluvial)

Progressive expansion: start routes-left / categories-right; click to insert
stages; band click shows exact import/call path; reweight by static imports,
reachable modules, runtime (later), latency, churn, cost, etc.

**File-hub dual-side projection (current):** column membership, seed clamp,
External package sinks, rails/paint, and Carbon free-source caveats are locked
in [hub-alluvial-behavior.md](./hub-alluvial-behavior.md). Engineers adjusting
the hub must keep changes **surgical** — do not rewrite that matrix (or its
goldens) to match unintended cascade side effects on other columns.

## Capability ladder

**Canonical analyzer ladder (L0–L4, multi-host protocol):**
[analysis-protocol.md](./analysis-protocol.md) — product direction for what
backends may claim. Summary:

| Cap | Capability |
| --- | ---------- |
| **L0** | Files + languages present |
| **L1** | Syntax import/export graph (current MVP for JS/TS + Python + Astro islands) |
| **L2** | Resolved modules / aliases (partial today; Program + rewrite maps planned) |
| **L3** | Symbols / types / public members (not landed; export-span mass is **not** L3) |
| **L4** | Build / bundle / runtime |

Historical product view ladder (projections / adapters — not the same as L0–L4
backend stamps):

| Level | Capability |
| ----- | ---------- |
| 1 | Files, imports, packages, routes |
| 2 | Symbols and categories |
| 3 | Calls, DB entities, external services |
| 4 | Framework-specific runtime semantics |
| 5 | Optional trace/test coverage overlays |

Agent CLI + Exact export-surface honesty: [analysis-honesty.md](./analysis-honesty.md).

## Design language (Sentinel-tracking)

Visual/UX grammar (MVP shell landed):

- **IBM Carbon** web components via thin wrappers (pages never raw `cds-*`)
- **Zinc** base shell + **teal** interactive/active chrome (brand map: teal-600/500/400 — **not** Sentinel emerald)
- **Purple** = active selection (`--atlas-select*`); status severity uses `--cds-status-*` (never brand teal for PASS/FAIL)
- **Alluvial / Sankey** (`@carbon/charts`) as the signature architecture visual
- Thin Astro pages + pure core modules for analysis (`src/core/`)
- **g100 dark only** today — no light mode

Token layers, support→status alias, and chart hex mirror:
[carbon-tokens.md](./carbon-tokens.md).

Reference (do not copy wholesale): `~/git-personal/sentinel/.grok/reference/carbon-ui.md`

## Out of scope (for now)

- Shipping raw source to remote analysis APIs as the default path
- Perfect monorepo/dynamic-import resolution on day one
- Forking global Grok role skills into this repo
- Inventing CI that is not wired in `package.json`
- Full Sentinel product domain (investing, satellite ops, etc.)

## Success bars

- [x] Runnable local dev path documented (`npm run dev`)
- [x] Level-1 graph from a sample ZIP in-browser
- [x] At least one catalog-suggested view opens an alluvial projection
- [x] Observed vs inferred labels visible in UI
- [ ] Full framework adapter interface (`detect/classify/enrich/suggest/inspect`)
- [ ] Progressive alluvial stage insertion
