---
id: dependency-structure-matrix
kind: idea
state: active
authority: exploratory
provenance: mixed

scope:
  - dependency-matrix
  - dsm
  - layer-violations
  - projections
  - coupling
  - cycles
  - architecture-rules
  - inspect
applies_when:
  - dependency structure matrix or adjacency matrix view
  - DSM layering cycles bidirectional coupling
  - package-by-package coupling grid
  - layer violation matrix or intended architecture ordering
  - drag reorder layers to propose architecture
  - scalable alternative to force-directed graphs
  - third lens after alluvial and heatmap
touches:
  - src/core graph edges
  - src/core/catalog
  - src/core/view inspect path
  - future matrix projector
  - layer classifiers / adapters (later)
  - interchangeable-atlas-lenses
invariants:
  - Matrix cells are projections of CodeGraph edges (and optional weights)
  - Prefer clustered / layer-ordered axes over raw whole-repo file×file N²
  - Cell drill-down should reuse inspect / edge evidence paths when possible
open_questions:
  - First grain: path-prefix packages vs top-N hotspot files vs inferred layers
  - Weight in cell: edge count vs transferred LOC mass
  - When (if ever) to ship matrix reorder as architectural modeling
  - Cycle highlighting algorithm and honesty labels
related:
  - interchangeable-atlas-lenses
  - hierarchical-heatmap-lens
  - geometric-vs-knot-architecture
  - analysis-capability-honesty
realized_by: []
superseded_by: null
rationale_quality: full
---

# Dependency Structure Matrix (DSM) lens

## Problem

Node-link graphs (and sometimes alluvial) struggle to make **layering, cycles,
and unexpected bidirectional coupling** obvious at package/subsystem scale.
Force-directed layouts do not scale; pure lists hide block structure.

## Intent

Third coordinated lens: adjacency / DSM grid over the same graph.

```text
             UI   Domain   DB   Utils
UI            ·      █      ·     █
Domain        ·      ·      █     █
DB            ·      ·      ·     █
Utils         ·      ·      ·     ·
```

Useful interactions (ladder, not one PR):

1. Auto order by path prefix or inferred layer.
2. Cell weight (edges / mass); click → exact import evidence.
3. Highlight cycles and illegal edges when rules exist.
4. Later: reorder axes to **propose** desired architecture and list violations
   (“move DB below domain → show every violating edge”).

## Reasoning

- Same SoR as alluvial; no new analysis host for Level-1 package/file grain.
- Established architecture-analysis technique; underused in everyday tools.
- Complements flow (alluvial = corridor narrative; matrix = structure).
- User research preference: matrix view is a liked port.
- Killer reorder interaction is high value but **modeling UX**, not required for
  first matrix land - ship read-only clustered DSM first.

## Rejected alternatives + why

| Alternative                             | Why not                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| Whole-repo file×file matrix as default  | N² unreadable; start package / top-N / layer             |
| Matrix as only architecture view        | Loses path narrative; keep alluvial signature            |
| Chord diagrams as substitute            | Fine for few subsystems; matrix scales better for layers |
| Rules engine required before any matrix | Rules can wait; observed coupling grid is useful alone   |

## Open questions

See frontmatter. Also: CLI emission of matrix slices for agents vs web-first UI.

## Revisit when

- Building any adjacency / layer-coupling visualization.
- Introducing declared architecture rules or desired-vs-actual overlays.
- Package monorepo graphs make prefix clustering insufficient.

## Provenance

Design chat DSM section + research port analysis. Exploratory.
