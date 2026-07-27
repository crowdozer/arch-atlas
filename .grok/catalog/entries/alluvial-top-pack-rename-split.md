---
id: alluvial-top-pack-rename-split
kind: proposal
state: implemented
authority: advisory
provenance: mixed

scope:
  - client-rendering
  - alluvial-polish
  - stage-extract
  - dual-host
  - naming
  - godfile
  - carbon-charts
  - hub-alluvial
applies_when:
  - refactoring src/client/alluvialPolish
  - renaming alluvialPolish or polishAlluvialHolder
  - former alluvialTopPack module or godfile cleanup
  - extracting stage from client
  - dual-host stage bundle for webview
  - Carbon alluvial post-mount polish
  - External straighten or pad-rail DOM surgery
  - terminator chrome on hub alluvial
  - File spine center highlight label truncate
  - client rendering package split under alluvialPolish
  - src/stage ownership of chart paint
  - alluvialPolish.test.ts geometry suite
touches:
  - src/client/alluvialPolish/
  - src/client/alluvialPolish/index.ts
  - src/client/alluvialPolish/polish.ts
  - src/client/alluvialPolish/alluvialPolish.test.ts
  - src/client/app.ts (polishAlluvialHolder call site)
  - src/client/focus/displayInventory.ts
  - src/client/focus/e2e/focusE2eBoot.ts
  - future src/stage/*
  - dual-host-shell-stage catalog plan
invariants:
  - Graph (CodeGraph) remains SoR; polish only mutates Carbon DOM projections
  - Hub alluvial geometry matrix / field notes stay surgical — rename must not retcon law
  - Pure helpers that do not need document stay extractable; DOM polish stays out of src/core
open_questions:
  - How many exports stay public vs become module-private once only polish facade is needed?
  - Dual-host stage extract still future — when to move package under src/stage?
related:
  - dual-host-shell-stage
  - geometric-vs-knot-architecture
realized_by:
  - src/client/alluvialPolish/
  - src/client/alluvialPolish/index.ts
  - src/client/alluvialPolish/polish.ts
  - src/client/alluvialPolish/externalStraighten.ts
  - src/client/alluvialPolish/labels.ts
  - src/client/alluvialPolish/rails.ts
  - src/client/alluvialPolish/terminators.ts
  - src/client/alluvialPolish/fileSpine.ts
  - src/client/alluvialPolish/fileChrome.ts
  - src/client/alluvialPolish/sankeyDom.ts
  - src/client/alluvialPolish/alluvialPolish.test.ts
  - src/client/app.ts
  - src/client/focus/displayInventory.ts
  - src/client/focus/e2e/focusE2eBoot.ts
  - .grok/reference/hub-alluvial-behavior.md
  - .grok/reference/hub-alluvial-field-notes.md
  - "ship: 266dfe9 refactor(view): rename alluvialTopPack to alluvialPolish package"
  - "merge: 9181841 chore(arch-atlas): merge alluvialPolish package rename"
superseded_by: null
rationale_quality: full
---

# Rename + split `alluvialTopPack` (client rendering godfile)

**Status:** implemented (rename + split under `src/client/alluvialPolish/`).  
No `src/stage` extract in this land — dual-host stage move remains future work
(see `dual-host-shell-stage`).

## Problem

`src/client/alluvialTopPack.ts` was a **live client rendering godfile** whose
name no longer described what it did.

- **"Top pack"** originally meant hub File spine vertical centering after Carbon
  mount. The module owned the full post-mount polish pipeline: center spine,
  right-truncate labels, hide pad rails, straighten External package bands,
  mark import/export terminators, File column highlight + icon, export-side
  recolor.
- Production entry is `polishAlluvialHolder` (called from `app.ts` after every
  hub mount, and from focus e2e boot). Many other exports exist for tests and a
  couple of pure helpers (`isExternalStraightPairLink` for focus inventory).
- Agents and humans misread the file as dead packing leftover or "top of chart
  only," which blocked dual-host **stage** extraction and correct ownership.

The test file `alluvialTopPack.test.ts` was **not** dead either — large geometry
law suite for straighten/rails/terminators — but inherited the same misleading
name.

## Intent

1. **Rename** the module (and test twin) so the name matches responsibility:
   post-Carbon **alluvial polish / stage paint**, not "top pack."
2. **Split** toward dual-host `src/stage` readiness: clear facade + internal
   concern modules, without rewriting hub geometry law.
3. Preserve call sites' behavior; this is structural honesty, not a chart rewrite.

## Reasoning

| Observation | Implication |
| ----------- | ----------- |
| Only `polishAlluvialHolder` is the web host facade | Rename should center the **polish** concept, not "topPack" |
| Dual-host catalog wants shared **stage** in browser + webview | Natural home after extract: `src/stage/…`, not forever under `client/` |
| Many exports are test-facing pure pieces | Split may keep pure planners (`planExternalStraightBands`) importable; DOM mutation stays stage-private |
| Hub field notes / geometry matrix are load-bearing | Surgical rename/split only — no matrix retcon |
| `app.ts` already god-controller | Do not merge polish into `app.ts`; extract *out* of misleading name |

**Name decision (resolved this land):**

| Candidate | Outcome |
| --------- | ------- |
| `alluvialPolish` (package under `src/client/`) | **Chosen** — matches `polishAlluvialHolder`; split landed under client |
| `hubAlluvialPolish.ts` | Not used |
| `stage/alluvialMountPolish.ts` | Deferred — no `src/stage` this PR |
| `carbonAlluvialPostprocess.ts` | Not used |

**Split (landed under `src/client/alluvialPolish/`):**

- `labels.ts` — truncate  
- `rails.ts` — undraw pads  
- `externalStraighten.ts` — plan + paint  
- `terminators.ts`  
- `fileSpine.ts` — center  
- `fileChrome.ts` — highlight, icon, export recolor  
- `sankeyDom.ts` — shared Carbon DOM helpers  
- Facade: `polish.ts` → `polishAlluvialHolder`; package barrel `index.ts`

## Rejected alternatives + why

1. **Delete as dead code** — false; on every hub mount and focus e2e.  
2. **Leave name, only document** — still misleads retrieval and dual-host stage
   ownership; user asked rename.  
3. **Absorb into `app.ts`** — worsens client god controller; opposite of dual-host.  
4. **Move pure geometry into `src/core`** — DOM/`__data__` Carbon surgery is
   host/stage; core stays pure graph. Only pure plan helpers *might* move if
   they stay document-free and shared (optional later).  
5. **Big-bang dual-host + rename + matrix edit** — scope blowup; prior dual-host
   ship aborted when over-wide. Prefer rename/split PR(s) then stage extract.

## Current call graph (evidence after land)

```text
app.ts / focusE2eBoot
  → polishAlluvialHolder (alluvialPolish/polish.ts via index.ts)
       → centerHubFileSpine / fileSpine
       → rightTruncateAlluvialLabels / labels
       → hideAlluvialRails / rails
       → straightenExternalPackageBands / planExternalStraightBands
       → markAlluvialTerminators / markAlluvialExportTerminators
       → highlightFileSpine / recolorExportBands / fileChrome

displayInventory.ts
  → isExternalStraightPairLink (must stay consistent with polish undraw law)
```

## Open questions (remaining)

- Public export surface: keep geometry helpers exported for tests only, or
  colocate tests with private modules?  
- Dual-host catalog still owns **when** to move `alluvialPolish` under `src/stage`.

**Resolved this land:** name=`alluvialPolish` package under `src/client/`;
split by concern; no `src/stage` in this PR.

## Revisit when

- Dual-host stage extract starts → link `realized_by` from `dual-host-shell-stage`;
  may move package path without reopening rename rationale.  
- Product drops Carbon postprocess → supersede or reject with note.  
- Geometry matrix rewrite (unlikely) would force revisit of split boundaries.

## Provenance

- User: name is misleading; client rendering godfile; `/catalog` for refactoring
  and renaming; later ship land rename+split.  
- Agent: confirmed live production path (not dead code); related dual-host stage
  ownership and godfile/topology ideas.  
- Land evidence: `266dfe9` / merge `9181841` on main.
