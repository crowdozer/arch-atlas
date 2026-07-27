---
id: alluvial-nav-order-and-residual-mass
kind: idea
state: active
authority: exploratory
provenance: user

scope:
  - hub-alluvial
  - alluvial-navigation
  - band-order
  - residual-mass
  - mass-honesty
  - client-controls
  - stage-polish
  - file-hub
applies_when:
  - hub alluvial bar heights do not sum to file total LOC
  - residual private body not imported or not exported
  - not-exported or not-imported band experiment
  - stabilizing band order across clicks or re-renders
  - sorting alluvial bands by name LOC or directory walk
  - band traverse hard to follow during hub navigation
  - dropdown for alluvial column sort order
  - checkbox for experimental residual mass bands
  - mass mismatch between File spine and linked flow
  - hub orientation or category membership vs total mass
  - pad rails residual straighten interacting with band order
touches:
  - src/core/view/fileHub.ts
  - src/core/view/alluvial.ts
  - src/stage/polish/
  - src/shell/ (controls / view options if landed)
  - src/client/ (UI chrome for sort dropdown + residual checkbox)
  - .grok/reference/hub-alluvial-behavior.md
  - .grok/reference/hub-alluvial-field-notes.md
  - .grok/reference/analysis-honesty.md
invariants: []
open_questions:
  - Residual mass definition — whole-file LOC minus linked flow, export-surface residual only, or private body under Exact?
  - Does "Not exported" live on the File spine, Imports side, Exports side, or a dedicated residual rail?
  - Sort scope — per column independently, global stable key, or sticky order across drill/focus changes?
  - Dir-walk sort — relative to focus file path, repo root, or package boundary?
  - Default sort when user never touches the dropdown?
  - Does residual-band UI require Exact, or is Estimate whole-file residual honest enough to ship first?
  - Interaction with pad rails, External straighten, terminators, multi-instance hubs — residual bands must not retcon membership law
related:
  - analysis-capability-honesty
  - exact-surface-mode-futures
  - alluvial-top-pack-rename-split
  - segmented-relative-path-labels
  - geometric-vs-knot-architecture
  - hierarchical-heatmap-lens
realized_by: []
superseded_by: null
rationale_quality: full
---

# Alluvial navigation: residual mass bands + stable band sort

Exploratory UX idea from user. **Not** product law; residual bands are explicitly
**experimental** and should stay behind a control if implemented.

## Problem

1. **Mass mismatch.** Hub alluvial band heights often fail to add up to the
   focused file’s total code length. A common cause is mass that never enters the
   import/export flow graph (private body, unused surface, code not imported by
   anyone in the hub radius, or not re-exported outward). The chart then feels
   “short” or leaky relative to File LOC, without a visible account of the gap.

2. **Traverse disorientation.** During band click / focus traverse, column order
   can be hard to predict. Users cannot easily infer *where they are going next*
   because band stacking is not stabilized by an intuitive, user-visible rule
   (name, size, or path proximity). Re-renders after navigation can reshuffle
   visual position and break spatial memory.

## Intent

1. **Residual bands (experimental):** Optionally show accounting bands such as
   **“Not exported”** and/or **“Not imported”** so residual code mass has a place
   in the diagram instead of silently vanishing from the flow total. Goal: make
   bar totals feel closer to total file length (or an honest stated subset), and
   make the gap legible rather than mysterious.

2. **Stable, controllable band order:** Offer a **dropdown** to choose how bands
   within columns are ordered, with at least:
   - sort by **name**
   - sort by **LOC / mass**
   - sort by **directory walk toward target** (path proximity / tree walk)

   Goal: stabilize output in an intuitive way so band traverse is learnable.

3. **Control surface:**
   - Sort modes → **dropdown toggle**
   - Residual not-exported / not-imported bands → **checkbox** (off by default;
     experimental)

## Reasoning

| Observation | Implication |
| ----------- | ----------- |
| Hub shows *linked* flow mass, not whole-file mass | Gap is expected under current membership law; UX needs an **account**, not a silent retcon of Imports/Exports membership |
| Exact vs Estimate already distinguish surface vs whole-file | Residual definition must stay honest to precision mode (see `analysis-capability-honesty`) |
| Band order is currently implementation-default (often name-ish compare in alluvial helpers) | Making order a **user preference** is cheaper than freezing one “correct” global order |
| Dir-walk sort aligns with path-context work | Complements `segmented-relative-path-labels` without requiring it |
| Residual bands change geometry and mental model | Keep experimental + opt-in so default hub matrix stays surgical |

**Hypotheses (not confirmed):**

- A residual band whose mass ≈ `fileLoc − Σ(linked flow)` would “smooth out”
  perceived shortfall for many files.
- Name / LOC / dir-walk covers the main navigation strategies people already
  use when scanning a column.
- Checkbox default-off avoids training users on provisional mass accounting
  before the definition is solid.

## Rejected alternatives + why

1. **Always show residual bands, no toggle** — experimental mass accounting
   should not become default law until definition and honesty labels are solid.
2. **Silently reweight linked bands to fill file LOC** — lies about topology;
   conflicts with mass-honesty and hub membership purity.
3. **Only one fixed sort forever** — different tasks need different stability
   cues (scan by size vs find by name vs walk toward a path).
4. **Rewrite hub geometry matrix to invent residual columns as first-class
   membership** — premature; residual is an overlay/accounting experiment, not
   a cascade membership change until proven.
5. **Sort via polish-only DOM reorder after Carbon mount** — fragile; order
   should be decided in projection data when possible so focus, goldens, and
   tooltips stay consistent.

## Open questions

- Residual **definition** under Estimate (whole-file − linked) vs Exact
  (export-surface residual / private body / icebergs relationship).
- **Placement** of residual bands (File spine, side columns, terminator-adjacent
  chrome) without breaking pad-rail / External straighten law.
- Whether residual mass is **per focus file only** or also appears on multi-hop
  nodes.
- Sort **persistence** (session only vs project preference) and interaction with
  multi-instance hub labels (`·hN`).
- Whether dir-walk sort needs tree SoR path segments or string-prefix is enough
  for v0.

## Revisit when

- Implementing hub alluvial controls, sort preferences, or residual-mass UX.
- Mass honesty / Exact surface work changes how “total code length” is labeled.
- Users report band traverse confusion or LOC-vs-bar mismatch as a primary
  pain (promote toward advisory with evidence).
- Hub matrix deliberately gains residual columns — then reconcile this entry
  (`state: implemented` / `partial`) and link `realized_by`.
- Residual experiment fails honesty or geometry — mark `rejected` with why.

## Provenance

- User (`/catalog`): residual “Not exported” / “Not imported” bands for
  LOC-vs-bar mismatch; stabilize band order via name / LOC / dir-walk dropdown;
  residual experimental behind checkbox.
- Agent: framed against hub membership purity, mass honesty, and existing
  alluvial compare/sort helpers — no implementation claim.
