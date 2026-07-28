---
id: mermaid-structure-graph
kind: idea
state: implemented
authority: exploratory
provenance: user

scope:
  - mermaid
  - structure-graph
  - folder-tree
  - dependency-graph
  - agent-export
  - projections
  - epistemic-honesty
  - atlas-lenses
applies_when:
  - automated mermaid graph or flowchart export
  - dependency + folder structure diagram (not domain map)
  - agent lens or ChatGPT-portable architecture sketch
  - structural overview without inferred features/domains
  - flowchart of packages or path prefixes from CodeGraph
  - mermaid flowchart TD or graph LR from import edges
  - second/third lens after alluvial for static structure
  - CLI digest/tree companion that renders as mermaid
  - avoiding force-directed hairball for agent handoff
  - containment-only folder and file hierarchy from indexed paths
touches:
  - src/core/export/agentMermaid.ts
  - src/core/export/agentMermaid.test.ts
  - src/cli/main.ts (mermaid command)
  - src/cli/main.test.ts
  - src/core/index.ts (buildAgentMermaid export)
  - README.md / AGENTS.md agent CLI docs
  - interchangeable-atlas-lenses
  - dependency-structure-matrix
  - hierarchical-heatmap-lens
  - analysis-capability-honesty
invariants:
  - Nodes and edges are projections of CodeGraph + path structure only
  - Do not invent domain/feature labels; folder prefixes and observed imports only
  - Unresolved / external ends stay labeled honestly (Estimate/Exact honesty ladder)
  - Mermaid is a portable projection, not a second source of record
  - Dependency mode always lists file-level runtime SCCs in %% comments (within-prefix honesty)
  - Dependency grain is topFolder path-prefix (not external npm package names)
  - Containment mode uses indexed paths only and never emits dependency or SCC claims
open_questions:
  - Hybrid expand (folder subgraphs + file leaves) deferred beyond v1 topFolder rollup
  - In-app / web mermaid render vs CLI text-only (v1 is CLI text export)
related:
  - interchangeable-atlas-lenses
  - dependency-structure-matrix
  - hierarchical-heatmap-lens
  - analysis-capability-honesty
  - analysis-protocol-multi-host
  - geometric-vs-knot-architecture
  - "ops: .grok/reference/cycles-cheatsheet.md — circular import scan (digest SCCs vs mermaid honesty)"
realized_by:
  - src/core/export/agentMermaid.ts
  - src/core/export/agentMermaid.test.ts
  - src/cli/main.ts
  - src/cli/main.test.ts
  - src/core/index.ts
  - README.md
  - AGENTS.md
  - .grok/skills/_shared/preamble.md
  - "ship: 014be6a feat(cli): add mermaid structure graph export"
  - "ship: b7ef96e test(cli): fix vacuous mermaid bidirectional edge assertion"
  - "ship: e238d49 feat(core): add Mermaid containment projection"
superseded_by: null
rationale_quality: full
---

# Automated Mermaid structure graph (dependency + folder)

**Status:** implemented (CLI dependency + containment modes). Command
`arch-atlas mermaid <path>` emits pasteable Mermaid **text** (no JSON wrapper,
no markdown fence). Projection of CodeGraph only; not a second analyzer.

## Problem

Agent lenses (digest / tree / file) and catalog ranks are strong for machines and
lists, but weak as a **single glance structural sketch** for humans or LLMs.
Force-directed graphs do not travel well in chat; alluvial answers flow, not
folder containment + coupling at a glance. Risk of “domain architecture”
diagrams that **infer** features the graph never observed.

## Intent

Automated **Mermaid** view (export and/or in-product) whose nodes and groups come
only from:

1. **Folder / path structure** (containment, packages, prefixes already in the graph), and  
2. **Observed dependency edges** (imports between those nodes).

Not inferred domains, not feature classifiers, not “this looks like a hexagonal
core.” Output should be pasteable into ChatGPT/docs and regenerable from the
same CodeGraph as other lenses.

## v1 decisions (landed)

| Question | Decision |
| -------- | -------- |
| Command name | `mermaid` (alongside digest/tree/file/impact) |
| Host / format | **CLI text export only** — plain `flowchart LR` to stdout / `--out` |
| Grain | **`topFolder` path-prefix** rollup of runtime file→file imports (same-prefix self-loops omitted) |
| Edge labels | Cross-prefix import **counts** |
| Cycles | File SCCs always in `%% cycles.runtime (file SCC)` comments; multi-prefix SCCs as subgraphs; size-2 mutual pairs may use `<-->` |
| Cap | `--limit N` max prefix nodes (default 40); SCC-related prefixes force-included when possible |
| Analysis tier | L1 Estimate topology only — not Exact mass, not Program, not domain map |
| Hybrid expand | **Deferred** in dependency mode |
| Containment | Opt-in `--containment`: `flowchart TB`, indexed folder/file paths only, no edges or SCCs |
| Containment cap | `--limit N` alphabetically ordered file leaves; ancestors retained |

Header comments stamp source, scope omit/presets, truncation, and cycle honesty
so within-prefix knots (e.g. physics↔weapons under `client/sim`) stay visible
when they collapse to one topFolder node.

Sketch (illustrative shape, not a schema):

```mermaid
flowchart LR
  n0["client"]
  n1["client/sim"]
  n0 -->|"2"| n1
```

## Reasoning

- **Honesty fit:** folder + imports are Level-1 facts; domain maps are not.
  Aligns with analysis-capability-honesty and “graph as SoR, lenses as
  projections.”
- **Agent portability:** Mermaid is ubiquitous in markdown/LLM UIs; pairs with
  digest/tree without shipping raw source.
- **Complementary, not replacement:** alluvial = mass flow corridors; heatmap =
  mass×heat; DSM = layer coupling grid; mermaid structure = **containment +
  directed coupling sketch** for small-medium grain.
- **User constraint explicit:** “not inferred domain” — keep labeling path-true
  (`client/sim`, not “Gameplay Domain”).

## Rejected alternatives + why

| Alternative | Why not (for this idea) |
| ----------- | ------------------------ |
| Inferred domain / feature continents as mermaid nodes | Violates “not inferred domain”; that’s a later classifier product |
| Full file×file mermaid for whole repo | Hairball; unreadable; blow LLM context |
| Mermaid as only architecture lens | Loses mass/flow/heat; keep multi-lens atlas |
| Hand-authored architecture diagrams as product SoR | Drift; must regenerate from graph |
| Force-directed SVG instead of mermaid for agents | Less portable in chat; mermaid is the agent-facing shape |
| External npm package names as grain | v1 is path-prefix structure of the repo, not package ecosystem map |

## Open questions (remaining)

See frontmatter. Practical follow-ons:

1. **Hybrid expand** — subgraphs = folders; optional file leaves under a prefix.  
2. **In-app mermaid** — embed render in web host vs keep CLI-only.  

## Revisit when

- Hybrid expand or web embed is prioritized.
- Package rollup or omit-glob semantics change (affects default grain).
- Containment output needs optional directory-chain compaction or another path presentation policy.

## Provenance

User idea after artillery ZIP agent-lens pack: automated mermaid based on
dependency / folder structure, explicitly **not** inferred domain. v1 shipped as
CLI text export with topFolder grain + file SCC comment honesty. A later ship
added opt-in containment from indexed paths while leaving dependency output
unchanged.
