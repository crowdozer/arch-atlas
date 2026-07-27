---
id: mermaid-structure-graph
kind: idea
state: active
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
touches:
  - src/core/export agent digest / tree / future mermaid builder
  - src/core graph edges + packages
  - path-prefix package rollup (existing Level-1)
  - optional web stage or shell panel that embeds mermaid
  - interchangeable-atlas-lenses
  - dependency-structure-matrix
  - hierarchical-heatmap-lens
  - analysis-capability-honesty
invariants:
  - Nodes and edges are projections of CodeGraph + path structure only
  - Do not invent domain/feature labels; folder prefixes and observed imports only
  - Unresolved / external ends stay labeled honestly (Estimate/Exact honesty ladder)
  - Mermaid is a portable projection, not a second source of record
open_questions:
  - Grain default: packages/path-prefixes vs top-N files vs hybrid
  - Host: CLI text artifact only vs in-app mermaid render vs both
  - Edge aggregation: package→package counts vs sampled file edges
  - Size budgets for LLM paste vs file attach (collapse depth, max nodes)
  - Cycle / multi-edge rendering in mermaid without becoming unreadable
  - Whether tree (containment) and dependency (imports) are one diagram or two modes
related:
  - interchangeable-atlas-lenses
  - dependency-structure-matrix
  - hierarchical-heatmap-lens
  - analysis-capability-honesty
  - geometric-vs-knot-architecture
realized_by: []
superseded_by: null
rationale_quality: full
---

# Automated Mermaid structure graph (dependency + folder)

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

Sketch (illustrative, not a schema):

```mermaid
flowchart TB
  subgraph client
    sim
    game
    render
  end
  subgraph server
    routes
  end
  game --> sim
  game --> render
  routes --> savegame
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
- Low implementation surface if first ship is **CLI export** from existing
  package/edge rollups; UI embed can wait.

## Rejected alternatives + why

| Alternative | Why not (for this idea) |
| ----------- | ------------------------ |
| Inferred domain / feature continents as mermaid nodes | Violates “not inferred domain”; that’s a later classifier product |
| Full file×file mermaid for whole repo | Hairball; unreadable; blow LLM context |
| Mermaid as only architecture lens | Loses mass/flow/heat; keep multi-lens atlas |
| Hand-authored architecture diagrams as product SoR | Drift; must regenerate from graph |
| Force-directed SVG instead of mermaid for agents | Less portable in chat; mermaid is the agent-facing shape |

## Open questions

See frontmatter. Practical first cut candidates:

1. **Package/prefix graph** — nodes = Level-1 packages; edge label = import count.  
2. **Folder tree mode** — mermaid mindmap or nested subgraphs from tree lens only.  
3. **Hybrid** — subgraphs = folders; edges = package-level imports (cap N nodes).

Honesty: mark `unresolved:*` and externals; stamp Estimate vs Exact on the
export header (topology edges unchanged by Exact mass overlay).

## Revisit when

- Adding any non-alluvial structural export for agents or docs.
- Designing a second lens after alluvial (compare vs heatmap/DSM priority).
- ChatGPT / agent handoff packs need a diagram channel beyond JSON ranks.
- Package rollup or omit-glob semantics change (affects default grain).

## Provenance

User idea after artillery ZIP agent-lens pack: automated mermaid based on
dependency / folder structure, explicitly **not** inferred domain. Exploratory —
no host or grain decided.
