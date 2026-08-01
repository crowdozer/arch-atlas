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
  - Residual mass definition - whole-file LOC minus linked flow, export-surface residual only, or private body under Exact?
  - Does "Not exported" live on the File spine, Imports side, Exports side, or a dedicated residual rail?
  - Sort scope - per column independently, global stable key, or sticky order across drill/focus changes?
  - Dir-walk sort - relative to focus file path, repo root, or package boundary? (v0: focus file path via string path segments; later cut from product)
  - Default sort when user never touches the dropdown? (landed product default: `name`)
  - Does residual-band UI require Exact, or is Estimate whole-file residual honest enough to ship first?
  - Interaction with pad rails, External straighten, terminators, multi-instance hubs - residual bands must not retcon membership law
  - Should flow / flow-target return to product UI after ranking is fixed, or stay API/tests only?
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
  - 274c99a  # fix(view): drop flow band-sort from product UI; default name
superseded_by: null
rationale_quality: full
---

# Alluvial navigation: residual mass bands + stable band sort

Exploratory UX idea from user. **Not** product law; residual bands are explicitly
**experimental** and should stay behind a control if implemented.

**State: `partial`.** Problem **#2 only** (controllable band sort) landed - product
surface is **Name** + **Node size** (default **name**). Problem **#1** (residual
mass bands) is still **open** - do not invent residual-band progress or treat
residual UI as shipped.

## Problem

1. **Mass mismatch.** Hub alluvial band heights often fail to add up to the
   focused file’s total code length. A common cause is mass that never enters the
   import/export flow graph (private body, unused surface, code not imported by
   anyone in the hub radius, or not re-exported outward). The chart then feels
   “short” or leaky relative to File LOC, without a visible account of the gap.
   **Still open** - no residual-band control or projection landed.

2. **Traverse disorientation.** During band click / focus traverse, column order
   can be hard to predict. Users cannot easily infer _where they are going next_
   because band stacking is not stabilized by an intuitive, user-visible rule
   (name, size, or path proximity). Re-renders after navigation can reshuffle
   visual position and break spatial memory.
   **Partially addressed** - see Realization below.

## Intent

1. **Residual bands (experimental):** Optionally show accounting bands such as
   **“Not exported”** and/or **“Not imported”** so residual code mass has a place
   in the diagram instead of silently vanishing from the flow total. Goal: make
   bar totals feel closer to total file length (or an honest stated subset), and
   make the gap legible rather than mysterious. **Not landed.**

2. **Stable, controllable band order:** Offer a **dropdown** to choose how bands
   within columns are ordered. **Product-live (current):**
   - sort by **name** (default) - alpha + overflow last (prior / unsorted feel)
   - sort by **node size** - whole-file LOC of the band’s file

   **API / experiment only** (type + rank helpers retained for tests; **not** in
   product dropdown; host `parseBandSortMode` maps them → `name`):
   - sort by **flow mass** - thickest **leaving** ribbon first (max outbound link)
   - sort by **flow mass (inputs)** - thickest **arriving** ribbon first (max inbound)

   Path/dir-walk mode was cut after field use. Flow modes were **removed from the
   product dropdown** when ranking did not match intended UX (commit `274c99a`);
   helpers and `BandSortMode` union values remain for unit tests / offline API.

   Goal: predictable vertical stack under a user-visible rule.
   **Landed for product surface** - payload SoR + polish Y-lock + session control
   (see Realization). Spine-facing pivot experiment rejected (looked “stuck”
   where out≈in; free sources under inputs all zero).

3. **Control surface:**
   - Sort modes → **dropdown toggle** - **landed** (`atlas-band-sort`: **Name** /
     **Node size** only; default **Name**)
   - Residual not-exported / not-imported bands → **checkbox** (off by default;
     experimental) - **not landed**

## Realization (problem #2 - band sort)

Ship `ship/f8f093b4-alluvial-band-sort` / commits `7825f9a` (feat) + `7849d73`
(merge on main). Follow-ups: drop dir-walk; polish Y-lock; split mass into
**flow** vs **node**; dump-driven retune to **max single-link** leave/arrive;
then **`274c99a`** - drop flow / flow-target from product UI; restore default
**name**.

| Surface        | What landed                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core           | `BandSortMode = 'name' \| 'flow' \| 'flow-target' \| 'node'`; rank helpers `flowBandMass` / `flowTargetBandMass` / `nodeBandMass` still exist; payload default **`name`**                                                 |
| Shell          | Product-live list `['name', 'node']`; `parseBandSortMode` accepts only those - legacy `mass` / `flow` / `flow-target` / `dir-walk` / unknown → **`name`** (API may still pass `bandSort: 'flow'\|…` past parse for tests) |
| Web UI         | **Band order** `atlas-band-sort`: **Name** / **Node size** only (not Flow mass)                                                                                                                                           |
| Stage polish   | `stackBandsByNodeRank` before File spine center; label polish mode default **name**                                                                                                                                       |
| Views threaded | `fileHub`, `packageHub`, `moduleFocus`, `multiHop`, `fileImporters` (+ `graph` for node LOC)                                                                                                                              |

**Honesty / limits (do not overclaim):**

- **Payload + `meta.nodeRank`** are the order SoR; polish restacks Y to match.
- **Product default** is **`name`** (session start + mount fallback). Do **not**
  claim Flow mass as live UI or default flow.
- **`name`:** alpha + overflow last + rails after real.
- **`node`:** whole-file LOC from `graph.contents` for file refs only; packages /
  buckets 0. **Estimate** file size - not Exact export-surface.
- **`flow` / `flow-target` (API/tests only):** max outbound / inbound ribbon
  width; pure sinks or free sources share mass 0 → name among zeros; multi-edge
  uses **max not sum**. Host parse never returns these modes so old dumps cannot
  re-select broken UX.
- Membership / hub column matrix unchanged.
- Session-only preference.
- Dir-walk removed (user cut).
- Sort ranks use existing link `value`s when flow modes are invoked via API
  (Estimate / Exact already baked by weight path) - does **not** invent residual
  bands (**problem #1 still open**).

## Reasoning

| Observation                                                 | Implication                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Hub shows _linked_ flow mass, not whole-file mass           | Gap is expected under current membership law; UX needs an **account**, not a silent retcon of Imports/Exports membership |
| Exact vs Estimate already distinguish surface vs whole-file | Residual definition must stay honest to precision mode (see `analysis-capability-honesty`)                               |
| Band order was implementation-default                       | Making order a **user preference** is cheaper than freezing one “correct” global order - **done for payload seed**       |
| Flow mass ranking misfired in product                       | Dropped from dropdown; keep type/helpers for tests until ranking is proven or rejected                                   |
| Dir-walk sort aligns with path-context work                 | Complements `segmented-relative-path-labels` without requiring it; cut from product after field use                      |
| Residual bands change geometry and mental model             | Keep experimental + opt-in so default hub matrix stays surgical                                                          |

**Hypotheses (not confirmed):**

- A residual band whose mass ≈ `fileLoc − Σ(linked flow)` would “smooth out”
  perceived shortfall for many files.
- Name / LOC covers the main navigation strategies people already use when
  scanning a column (flow modes remain a test/API hypothesis).
- Checkbox default-off avoids training users on provisional mass accounting
  before the definition is solid.
- Payload rank alone may be enough when Carbon seed order tracks node list;
  polish Y-enforce only if field evidence shows shuffle.

## Rejected alternatives + why

1. **Always show residual bands, no toggle** - experimental mass accounting
   should not become default law until definition and honesty labels are solid.
2. **Silently reweight linked bands to fill file LOC** - lies about topology;
   conflicts with mass-honesty and hub membership purity.
3. **Only one fixed sort forever** - different tasks need different stability
   cues (scan by size vs find by name vs walk toward a path).
4. **Rewrite hub geometry matrix to invent residual columns as first-class
   membership** - premature; residual is an overlay/accounting experiment, not
   a cascade membership change until proven.
5. **Sort via polish-only DOM reorder after Carbon mount** - fragile as the
   _only_ law; order should be decided in projection data when possible so
   focus, goldens, and tooltips stay consistent. (Polish Y-enforce remains an
   optional _follow-on_ if Carbon cross-reduction defeats the payload seed.)
6. **Keep Flow mass in product dropdown while ranking is wrong** - misleads;
   product surface reduced to Name + Node size (`274c99a`) until flow ranking is
   fixed or permanently retired.

## Open questions

### Residual (problem #1 - still fully open)

- Residual **definition** under Estimate (whole-file − linked) vs Exact
  (export-surface residual / private body / icebergs relationship).
- **Placement** of residual bands (File spine, side columns, terminator-adjacent
  chrome) without breaking pad-rail / External straighten law.
- Whether residual mass is **per focus file only** or also appears on multi-hop
  nodes.
- Does residual-band UI require Exact, or is Estimate whole-file residual honest
  enough to ship first?
- Interaction with pad rails, External straighten, terminators, multi-instance
  hubs - residual bands must not retcon membership law.

### Band sort (problem #2 - partial / product-narrowed)

- Sort **persistence** (session only today vs project preference) and interaction
  with multi-instance hub labels (`·hN`).
- Whether flow / flow-target should return to product UI after ranking is fixed,
  or stay API/tests only permanently.
- Whether dir-walk needs tree SoR path segments beyond string-prefix v0 (if ever
  reintroduced).
- Whether Carbon crossing reduction requires polish Y-stack by `meta.nodeRank`.

## Revisit when

- Residual-mass UX / checkbox experiment (problem #1) - keep residual intent here;
  promote `state` only when residual also lands or is rejected. **Do not invent
  residual progress** while still open.
- Field smoke: name/node look shuffled → consider polish Y-enforce by
  `meta.nodeRank` (do **not** rewrite hub membership matrix).
- Mass honesty / Exact surface work changes how “total code length” is labeled.
- Users report band traverse confusion or LOC-vs-bar mismatch as a primary
  pain (promote toward advisory with evidence).
- Hub matrix deliberately gains residual columns - then reconcile this entry
  (`state: implemented` if both problems done) and extend `realized_by`.
- Residual experiment fails honesty or geometry - mark residual rejected with why
  (band sort may remain partial/implemented independently).
- Flow ranking fixed with field evidence - optionally restore dropdown options;
  until then docs must not claim Flow mass as live product UX.

## Provenance

- User (`/catalog`): residual “Not exported” / “Not imported” bands for
  LOC-vs-bar mismatch; stabilize band order via name / LOC / dir-walk dropdown;
  residual experimental behind checkbox.
- Agent: framed against hub membership purity, mass honesty, and existing
  alluvial compare/sort helpers.
- Ship `f8f093b4` (problem #2 only): payload band sort + stage dropdown;
  residual intentionally out of scope.
- `274c99a`: product UI drops Flow mass / Flow mass (inputs); default **name**;
  type + helpers retained for tests; parse maps non-live modes → name.
