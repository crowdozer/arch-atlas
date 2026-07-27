---
id: alluvial-top-pack-rename-split
kind: proposal
state: active
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
  - refactoring src/client/alluvialTopPack.ts
  - renaming alluvialTopPack or polishAlluvialHolder
  - extracting stage from client
  - dual-host stage bundle for webview
  - Carbon alluvial post-mount polish
  - External straighten or pad-rail DOM surgery
  - terminator chrome on hub alluvial
  - File spine center highlight label truncate
  - client rendering godfile cleanup
  - src/stage ownership of chart paint
  - alluvialTopPack.test.ts geometry suite
touches:
  - src/client/alluvialTopPack.ts
  - src/client/alluvialTopPack.test.ts
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
  - Final module name — polishAlluvial / hubAlluvialStage / stage/alluvialPolish?
  - One facade file vs split by concern (labels, rails, straighten, terminators, spine)?
  - Move under src/stage in the same PR as rename, or rename in place first then dual-host extract?
  - How many exports stay public vs become module-private once only polish facade is needed?
related:
  - dual-host-shell-stage
  - geometric-vs-knot-architecture
realized_by: []
superseded_by: null
rationale_quality: full
---

# Rename + split `alluvialTopPack` (client rendering godfile)

## Problem

`src/client/alluvialTopPack.ts` is a **live client rendering godfile** whose
name no longer describes what it does.

- **"Top pack"** originally meant hub File spine vertical centering after Carbon
  mount. The module now owns the full post-mount polish pipeline: center spine,
  right-truncate labels, hide pad rails, straighten External package bands,
  mark import/export terminators, File column highlight + icon, export-side
  recolor.
- Production entry is `polishAlluvialHolder` (called from `app.ts` after every
  hub mount, and from focus e2e boot). Many other exports exist for tests and a
  couple of pure helpers (`isExternalStraightPairLink` for focus inventory).
- Agents and humans misread the file as dead packing leftover or "top of chart
  only," which blocks dual-host **stage** extraction and correct ownership.

The test file `alluvialTopPack.test.ts` is **not** dead either — large geometry
law suite for straighten/rails/terminators — but inherits the same misleading
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

**Name candidates (not final law):**

| Candidate | Pros | Cons |
| --------- | ---- | ---- |
| `alluvialPolish.ts` | Matches `polishAlluvialHolder` | Generic |
| `hubAlluvialPolish.ts` | Hub-specific truth today | May later polish non-hub |
| `stage/alluvialMountPolish.ts` | Dual-host aligned | Requires stage dir land |
| `carbonAlluvialPostprocess.ts` | Honest about Carbon | Verbose |

**Split candidates (later or same ship):**

- `*Labels*` — truncate  
- `*Rails*` / undraw pads  
- `*ExternalStraighten*` — plan + paint  
- `*Terminators*`  
- `*FileSpine*` — center, highlight, icon  
- Facade: `polishAlluvialHolder`

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

## Current call graph (evidence)

```text
app.ts / focusE2eBoot
  → polishAlluvialHolder (alluvialTopPack.ts)
       → topPackAlluvialHolder / centerHubFileSpine
       → rightTruncateAlluvialLabels
       → hideAlluvialRails
       → straightenExternalPackageBands / planExternalStraightBands
       → markAlluvialTerminators / markAlluvialExportTerminators
       → highlightFileSpine / recolorExportBands

displayInventory.ts
  → isExternalStraightPairLink (must stay consistent with polish undraw law)
```

## Open questions

- Final kebab path / export names?  
- Rename-in-place first vs land `src/stage` in the same change?  
- Public export surface: keep geometry helpers exported for tests only, or
  colocate tests with private modules?  
- Should dual-host catalog `touches` list this id as prerequisite for stage extract?

## Revisit when

- Dual-host stage extract starts → mark `partial` / link `realized_by`.  
- File renamed and tests green → `implemented` (rename) or `partial` if split incomplete.  
- Product drops Carbon postprocess → supersede or reject with note.  
- Geometry matrix rewrite (unlikely) would force revisit of split boundaries.

## Provenance

- User: name is misleading; client rendering godfile; `/catalog` for refactoring
  and renaming (not implement in this turn).  
- Agent: confirmed live production path (not dead code); related dual-host stage
  ownership and godfile/topology ideas.
