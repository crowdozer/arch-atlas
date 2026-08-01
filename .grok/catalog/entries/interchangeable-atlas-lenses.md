---
id: interchangeable-atlas-lenses
kind: proposal
state: active
authority: advisory
provenance: mixed

scope:
  - map-catalog
  - projections
  - alluvial-viz
  - heatmap
  - dependency-matrix
  - selection-continuity
  - atlas-metaphor
  - graph-as-sor
applies_when:
  - adding a second visualization beyond alluvial
  - treemap heatmap matrix or multi-lens workspace
  - interchangeable architectural lenses
  - cross-view selection continuity
  - city continent highway metaphor for code structure
  - architecture investigation environment not dep graph
  - porting visualization ideas from external design chats
  - choosing Phase A product surface after Level-1 graph
  - stable spatial identity across chart types
  - avoiding collection of unrelated code charts
touches:
  - src/core graph SoR
  - src/core/catalog
  - src/core/view/weight.ts
  - src/stage alluvial
  - src/client renderCatalog selection
  - future heatmap and matrix projectors
  - .grok/reference/scope.md suggested views
  - hierarchical-heatmap-lens
  - dependency-structure-matrix
  - git-architectural-time-machine
invariants:
  - Graph (CodeGraph) remains source of record; every lens is a projection
  - Alluvial stays signature flow language; other lenses do not replace it
  - Selection should survive lens switches when possible (same focus region/file)
  - Local-first static analysis remains the default capability path
open_questions:
  - Which second lens lands first (heatmap vs matrix) if only one ships
  - Whether heat paints alluvial chrome as well as a dedicated treemap view
  - How far folder-prefix regions go before true feature classifiers
  - Host ownership for multi-lens shell chrome (web client vs pure shell state)
related:
  - hierarchical-heatmap-lens
  - dependency-structure-matrix
  - git-architectural-time-machine
  - geometric-vs-knot-architecture
  - analysis-capability-honesty
  - dual-host-shell-stage
realized_by: []
superseded_by: null
rationale_quality: full
---

# Interchangeable atlas lenses (multi-view workspace)

## Problem

Alluvial is strong for **path / corridor / mass flow**, but a single chart type
cannot answer every architectural question. Commodity tools become either
force-directed hairballs or disconnected “chart tabs.” Risk for Arch Atlas:
accreting unrelated visuals without a shared selection model, or freezing the
product as “pretty Sankey only.”

## Intent

Treat the product as:

> A persistent, queryable spatial model of a codebase, with interchangeable
> architectural lenses.

User keeps one focus (file, package, feature, catalog hotspot) and moves across
lenses. Four coordinated views (target shape, not a mandate to build all at
once):

| Lens          | Role                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **Atlas**     | Hierarchical mass map + switchable heat (see `hierarchical-heatmap-lens`)   |
| **Flow**      | Alluvial (already signature)                                                |
| **Matrix**    | Dependency Structure Matrix (see `dependency-structure-matrix`)             |
| **Evolution** | Diff / churn / co-change (see `git-architectural-time-machine`; host-gated) |

Geographic **UX metaphor** (not a 3D city renderer):

| Metaphor        | Meaning                                         |
| --------------- | ----------------------------------------------- |
| Continent       | subsystem / package / inferred domain region    |
| City / district | folder or feature cluster                       |
| Building mass   | LOC or export-surface mass                      |
| Highway         | high-mass import corridor (alluvial band width) |
| Heat / storm    | risk or activity layer (color, not geometry)    |

## Reasoning

- Confirmed product posture already separates **graph SoR** from **projections**
  (`scope.md`, preamble). Multi-lens is the natural extension of catalog → view.
- Level-1 already supplies edges, LOC, hotspots, blast radius, weight axes -
  enough for Phase A heat + clustered matrix without Git.
- User signal (research session): city/continent metaphor, heatmaps, and matrix
  are preferred ports; alluvial band width already reads as highway traffic.
- Selection continuity is higher leverage than “twenty chart types”: without it,
  each view feels like a separate report.

### Phase A (static, no Git) - highest near-term signal

1. Heat as first-class metric layer on existing mass (treemap and/or paint).
2. Package- or path-prefix DSM with cell → inspect.
3. Cross-view selection continuity (catalog ↔ heat ↔ alluvial ↔ matrix).
4. Metaphor in captions/region language before any spatial layout engine.

### Later (do not block Phase A)

- Layer-rule overlay and matrix reorder (“what if DB sits below domain?”).
- Git evolution lenses only where a host sees `.git` (CLI / extension).

## Rejected alternatives + why

| Alternative                                     | Why not (now)                                                  |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Software City / 3D buildings                    | Relationships hard to follow; metaphor > literal city renderer |
| Force-directed “also a graph” as second lens    | Hairball; fights topology-centric atlas claim                  |
| Collection of independent chart pages           | Loses selection continuity; chart zoo                          |
| Architectural “weather” cosplay without metrics | Cosmetic sediment; vocabulary only after real scores exist     |
| Embedding-first semantic entropy as MVP heat    | Local-first + honesty cost; static coupling heat first         |
| Replacing alluvial with treemap                 | Alluvial remains signature flow language                       |

## Open questions

See frontmatter. Additional: whether agent CLI should emit heat/matrix digests
before web UI lands those projections.

## Revisit when

- A second lens ships and selection continuity is proven or fails.
- Framework adapters / feature classifiers change what “continent” means.
- Git or runtime feeds become first-class on a host and Evolution competes for
  Phase priority.
- User elevates or rejects this framing as product decision (`normative`).

## Provenance

Synthesized from shared design chat (“Graph Visualization Tools”) +
`/research` port analysis against Arch Atlas scope and Level-1 code. Design
memory only - not product law until user elevates.
