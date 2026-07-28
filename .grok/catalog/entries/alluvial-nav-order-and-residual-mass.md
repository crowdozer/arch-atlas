---
id: alluvial-nav-order-and-residual-mass
kind: idea
state: partial
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
  - src/shell/controls.ts
  - src/shell/project.ts
  - src/client/app.ts
  - src/client/wireUi.ts
  - src/pages/index.astro
  - .grok/reference/hub-alluvial-behavior.md
  - .grok/reference/hub-alluvial-field-notes.md
  - .grok/reference/analysis-honesty.md
invariants: []
open_questions:
  - Residual mass definition — whole-file LOC minus linked flow, export-surface residual only, or private body under Exact?
  - Does "Not exported" live on the File spine, Imports side, Exports side, or a dedicated residual rail?
  - Sort scope — per column independently, global stable key, or sticky order across drill/focus changes?
  - Dir-walk sort — relative to focus file path, repo root, or package boundary? (v0: focus file path via string path segments)
  - Default sort when user never touches the dropdown? (landed: `name`)
  - Does residual-band UI require Exact, or is Estimate whole-file residual honest enough to ship first?
  - Interaction with pad rails, External straighten, terminators, multi-instance hubs — residual bands must not retcon membership law
  - Does Carbon/d3-sankey crossing reduction defeat mass/dir-walk enough on real hubs to require polish Y-enforce by `meta.nodeRank`?
related:
  - analysis-capability-honesty
  - exact-surface-mode-futures
  - alluvial-top-pack-rename-split
  - segmented-relative-path-labels
  - geometric-vs-knot-architecture
  - hierarchical-heatmap-lens
realized_by:
  - 7825f9a  # feat(view): controllable alluvial band sort (name|mass|dir-walk)
  - 7849d73  # chore(view): merge band sort dropdown (problem #2)
superseded_by: null
rationale_quality: full
---

# Alluvial navigation: residual mass bands + stable band sort

Exploratory UX idea from user. **Not** product law; residual bands are explicitly
**experimental** and should stay behind a control if implemented.

**State: `partial`.** Problem **#2 only** (controllable band sort) landed.
Problem **#1** (residual mass bands) is still open — do not treat residual UI as
shipped.

## Problem

1. **Mass mismatch.** Hub alluvial band heights often fail to add up to the
   focused file’s total code length. A common cause is mass that never enters the
   import/export flow graph (private body, unused surface, code not imported by
   anyone in the hub radius, or not re-exported outward). The chart then feels
   “short” or leaky relative to File LOC, without a visible account of the gap.
   **Still open** — no residual-band control or projection landed.

2. **Traverse disorientation.** During band click / focus traverse, column order
   can be hard to predict. Users cannot easily infer *where they are going next*
   because band stacking is not stabilized by an intuitive, user-visible rule
   (name, size, or path proximity). Re-renders after navigation can reshuffle
   visual position and break spatial memory.
   **Partially addressed** — see Realization below.

## Intent

1. **Residual bands (experimental):** Optionally show accounting bands such as
   **“Not exported”** and/or **“Not imported”** so residual code mass has a place
   in the diagram instead of silently vanishing from the flow total. Goal: make
   bar totals feel closer to total file length (or an honest stated subset), and
   make the gap legible rather than mysterious. **Not landed.**

2. **Stable, controllable band order:** Offer a **dropdown** to choose how bands
   within columns are ordered, with at least:
   - sort by **name**
   - sort by **LOC / mass**
   - sort by **directory walk toward target** (path proximity / tree walk)

   Goal: stabilize output in an intuitive way so band traverse is learnable.
   **Landed as payload SoR + session control** (see Realization).

3. **Control surface:**
   - Sort modes → **dropdown toggle** — **landed** (`atlas-band-sort`)
   - Residual not-exported / not-imported bands → **checkbox** (off by default;
     experimental) — **not landed**

## Realization (problem #2 — band sort)

Ship `ship/f8f093b4-alluvial-band-sort` / commits `7825f9a` (feat) + `7849d73`
(merge on main).

| Surface | What landed |
| ------- | ----------- |
| Core | `BandSortMode = 'name' \| 'mass' \| 'dir-walk'`; `compareAlluvialBands`, `pathSegmentProximity`, `incidentBandMass`; `buildAlluvialPayload({ bandSort })` sorts **per category** and writes `rank` + `meta.nodeRank` |
| Shell | `parseBandSortMode` / `BAND_SORT_MODES`; `PayloadProjectOpts.bandSort` threaded through project → view builders |
| Web UI | Stage control **Band order** — dropdown id `atlas-band-sort` (Name / Mass / Path toward focus); session-only state in `app.ts` + `wireUi` remount |
| Views threaded | `fileHub`, `packageHub`, `moduleFocus`, `multiHop`, `fileImporters` |

**Honesty / limits (do not overclaim):**

- **Payload + `meta.nodeRank` are the source of record** for intended in-column
  order (unit-tested). Membership / hub column matrix is unchanged.
- **Carbon / d3-sankey may still cross-reduce Y** after mount. Stage polish does
  **not** read `nodeRank` or re-stack bands; visual order can diverge from
  payload rank on dense hubs.
- **Polish Y-enforce not landed** — plan allowed payload-first; add restack by
  `meta.nodeRank` only if field smoke shows mass/dir-walk are unusable.
- **Session-only** preference (not `PersistedSessionV1` / localStorage; no CLI
  flag).
- Default when unset / unknown parse: **`name`**.
- Sort tiers (all modes): overflow last → pad rails after real nodes → mode key
  → stable name (mass is incident non–rail↔rail link value; dir-walk is common
  path-prefix then segment delta then path id).

## Reasoning

| Observation | Implication |
| ----------- | ----------- |
| Hub shows *linked* flow mass, not whole-file mass | Gap is expected under current membership law; UX needs an **account**, not a silent retcon of Imports/Exports membership |
| Exact vs Estimate already distinguish surface vs whole-file | Residual definition must stay honest to precision mode (see `analysis-capability-honesty`) |
| Band order was implementation-default | Making order a **user preference** is cheaper than freezing one “correct” global order — **done for payload seed** |
| Dir-walk sort aligns with path-context work | Complements `segmented-relative-path-labels` without requiring it; v0 uses string path segments vs hub focus path |
| Residual bands change geometry and mental model | Keep experimental + opt-in so default hub matrix stays surgical |

**Hypotheses (not confirmed):**

- A residual band whose mass ≈ `fileLoc − Σ(linked flow)` would “smooth out”
  perceived shortfall for many files.
- Name / LOC / dir-walk covers the main navigation strategies people already
  use when scanning a column.
- Checkbox default-off avoids training users on provisional mass accounting
  before the definition is solid.
- Payload rank alone may be enough when Carbon seed order tracks node list;
  polish Y-enforce only if field evidence shows shuffle.

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
5. **Sort via polish-only DOM reorder after Carbon mount** — fragile as the
   *only* law; order should be decided in projection data when possible so
   focus, goldens, and tooltips stay consistent. (Polish Y-enforce remains an
   optional *follow-on* if Carbon cross-reduction defeats the payload seed.)

## Open questions

### Residual (problem #1 — still fully open)

- Residual **definition** under Estimate (whole-file − linked) vs Exact
  (export-surface residual / private body / icebergs relationship).
- **Placement** of residual bands (File spine, side columns, terminator-adjacent
  chrome) without breaking pad-rail / External straighten law.
- Whether residual mass is **per focus file only** or also appears on multi-hop
  nodes.
- Does residual-band UI require Exact, or is Estimate whole-file residual honest
  enough to ship first?
- Interaction with pad rails, External straighten, terminators, multi-instance
  hubs — residual bands must not retcon membership law.

### Band sort (problem #2 — partial)

- Sort **persistence** (session only today vs project preference) and interaction
  with multi-instance hub labels (`·hN`).
- Whether dir-walk needs tree SoR path segments beyond string-prefix v0.
- Whether Carbon crossing reduction requires polish Y-stack by `meta.nodeRank`.

## Revisit when

- Residual-mass UX / checkbox experiment (problem #1) — keep residual intent here;
  promote `state` only when residual also lands or is rejected.
- Field smoke: mass/dir-walk look shuffled → consider polish Y-enforce by
  `meta.nodeRank` (do **not** rewrite hub membership matrix).
- Mass honesty / Exact surface work changes how “total code length” is labeled.
- Users report band traverse confusion or LOC-vs-bar mismatch as a primary
  pain (promote toward advisory with evidence).
- Hub matrix deliberately gains residual columns — then reconcile this entry
  (`state: implemented` if both problems done) and extend `realized_by`.
- Residual experiment fails honesty or geometry — mark residual rejected with why
  (band sort may remain partial/implemented independently).

## Provenance

- User (`/catalog`): residual “Not exported” / “Not imported” bands for
  LOC-vs-bar mismatch; stabilize band order via name / LOC / dir-walk dropdown;
  residual experimental behind checkbox.
- Agent: framed against hub membership purity, mass honesty, and existing
  alluvial compare/sort helpers.
- Ship `f8f093b4` (problem #2 only): payload band sort + stage dropdown;
  residual intentionally out of scope.
