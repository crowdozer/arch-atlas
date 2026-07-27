---
id: hierarchical-heatmap-lens
kind: idea
state: active
authority: exploratory
provenance: mixed

scope:
  - heatmap
  - treemap
  - map-catalog
  - weight-axis
  - hotspots
  - blast-radius
  - projections
  - epistemic-honesty
applies_when:
  - hierarchical heatmap or treemap for codebase mass
  - LOC geometry with switchable color heat
  - coupling heat fan-in fan-out overlay
  - catalog hotspots spatialized not only ranked lists
  - second primitive beside alluvial
  - fragility score or risk prioritization map
  - heat layer vs weight axis design
  - CodeCharta-like metric layers without forking product
touches:
  - src/core/catalog/hotspots.ts
  - src/core/catalog/fileLoc.ts
  - src/core/catalog/blastRadius.ts
  - src/core/catalog/deepest.ts
  - src/core/view/weight.ts
  - future HeatAxis or heat projector
  - src/client renderCatalog
  - interchangeable-atlas-lenses
invariants:
  - LOC (or export-surface mass) is geometry; heat is a separate layer
  - Heuristic composites (fragility, entropy) must stay Inferred, not Observed
  - Heat projections read CodeGraph; do not invent a parallel mass store
open_questions:
  - Dedicated treemap surface vs heat on tree/catalog only vs alluvial node chrome
  - Shared HeatAxis type parallel to WeightAxis vs catalog-only scores
  - Default heat on open (coupling vs LOC-only mass map)
  - Folder rollup aggregation rules for incomplete package graphs
related:
  - interchangeable-atlas-lenses
  - dependency-structure-matrix
  - git-architectural-time-machine
  - analysis-capability-honesty
  - geometric-vs-knot-architecture
realized_by: []
superseded_by: null
rationale_quality: full
---

# Hierarchical heatmap lens

## Problem

Catalog already ranks hotspots, file LOC, complex, and blast radius as **lists**.
Lists do not show mass-vs-danger compound readings (“large but stable” vs “small
but hot”). Without a heat lens, users and agents under-use metrics already
computed on the graph.

## Intent

Second atlas primitive (after alluvial flow):

- **Geometry** = hierarchical mass (repository → package/folder → file; optional
  symbol split later).
- **Heat** = switchable metric color.

Compound reading:

| Mass | Heat | Rough meaning |
| ---- | ---- | ------------- |
| Large | Cool | Big and stable (or dormant) |
| Small | Hot | Small but high risk / activity |
| Large | Hot | Inspect soon |

## Reasoning

Level-1 static heat candidates (no Git):

1. **Coupling** — inDegree × outDegree or catalog edgeCount  
2. **Mass** — LOC / target-loc surface (geometry default; also a color option)  
3. **Blast** — reverse-reach consumer count  
4. **Complex** — downwind edges / hops from existing catalog complex  

Weight axes already separate mass encoding for alluvial bands
(`import-edges` | `importer-loc` | `target-loc`). Heat should follow the same
**projection-time** discipline: graph edges unweighted; scores computed for the
view.

Hold for Git-capable hosts: change heat, line-age, knowledge concentration,
repair gravity (see `git-architectural-time-machine`).

## Rejected alternatives + why

| Alternative | Why not |
| ----------- | ------- |
| Heat = only LOC | Collapses geometry and heat; loses compound signal |
| Fragility formula as first shipped heat | Useful later; must stay Inferred; start with observed degrees |
| Full CodeCity 3D | Overbuilds; relationships weak; see city metaphor in parent entry |
| Heat requires runtime or coverage | Violates Level-1-first ladder |

## Open questions

See frontmatter. Also: whether Exact export-surface mass should become heatmap
geometry when precision is Exact (honesty labels required).

## Revisit when

- Implementing any non-alluvial spatial metric view.
- Adding Git-derived overlays that re-use the same heat switcher.
- Catalog ranking bins change shape (new topology scores).

## Provenance

Port priority from design chat + research; user preferred heatmaps as near-term
fit. Exploratory — mechanism not decided.
