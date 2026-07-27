# Hub alluvial focus — behavioral matrix

**Status:** foundational product law (ship `5ee2b6cf`; harness pin `e6058c97`)  
**Code SoR:** `src/client/focus/logicalFocusGraph.ts` (plan),  
`src/client/focus/displayInventory.ts` + `focusApply.ts` (drawn bands),  
`src/client/focus/focusHarness.ts` (test observation: plan + inventory classify + MiniEl apply),  
thin wire in `src/client/app.ts`  
**Geometry matrix (orthogonal):** [hub-alluvial-behavior.md](./hub-alluvial-behavior.md)  
**Scar tissue:** [hub-alluvial-field-notes.md](./hub-alluvial-field-notes.md)

This document is the **working contract for hub hover focus/highlight**.  
Geometry membership (columns, pads, rails, straighten) is **not** owned here —
focus **consumes** payload + `meta.externalStraightPairs` and reconciles onto
**drawn** bands after polish. Do not rewrite `fileHub` pads to make hover easy.

---

## 1. Dual graph

| Graph | What it is | Focus role |
| ----- | ---------- | ---------- |
| **LogicalFocusGraph** | Non-rail file↔file edges from payload + External edges from **pairs only** + multi-instance aliases from `nodeRef` | SoR for “connected tree” on label hover |
| **Display graph** | Carbon `path.link` that remain painted after undraw + injected `path.atlas-alluvial-external-straight` | SoR for hit-testing and apply (focus/dim classes) |

**Rails never enter the logical graph.** Names containing `in-rail` / `out-rail`
are stripped when building edges and never appear in `activeLabels` or
`focusedBandKeys`.

Shared in-rails invent false Carbon connectivity (field notes E11/E13). Product
connectivity for External is **`externalStraightPairs` only**.

---

## 2. Seed kinds

| Seed | When | Product law |
| ---- | ---- | ----------- |
| **band** (`display: carbon \| straighten`) | Hover a drawn ribbon | That edge only; endpoint labels (+ non-multi-instance aliases) |
| **file** | Hover a file label | Reverse∪forward on file edges; packages only if pair parent ∈ hovered∪**forward** descendants |
| **package** | Hover External package / unresolved chip | Reverse-path **union** from all pair parents of that package |
| **file-spine** | Hover the hub File column spine | Same as **file** for `meta.startId` / File focus label |

Band hover does **not** expand the tree of either endpoint.

---

## 3. Closure rules (locked)

### 3a. Band-only (`L-band-*`)

```text
activeLabels = aliasExpand({ source, target })
focusedBandKeys = { that edge key }
// sibling forks of same parent stay dim
```

Carbon key: `source\0target`  
Straighten key: `ext:parent\0packageName`

### 3b. File label (`L-file-*`)

```text
descendants = forwardBFS(hovered) on fileEdges   // includes hovered
ancestors   = reverseBFS(hovered) on fileEdges   // includes hovered
packageParentFiles = aliasExpand(descendants)    // NOT reverse-only ancestors
activeFiles = ancestors ∪ descendants
packages = { pkg | pair parent ∈ packageParentFiles }
activeLabels = aliasExpand(activeFiles ∪ packages)
focusedBands =
  every fileEdge with both ends in activeFiles (alias-aware, L-instance-local)
  ∪ every externalEdge whose parent ∈ packageParentFiles
```

**App vs main→react-dom:** hovering `App` lights reverse ancestors (e.g. `main`)
but **does not** light packages whose only parents are reverse-only (main→react-dom).

### 3b′. Multi-instance local identity (`L-instance-local`) — interim

Hub multi-hop paints the same path at several display names (`path` and
`path · hN`). Until **instance fingerprinting**, focus must **not** treat those
labels as one id for membership / BFS alias expand.

| Rule | Behavior |
| ---- | -------- |
| `expandFileAliases` | Never maps `· hN` ↔ primary (or other hops) of the same path id |
| `nameInFocus` | Multi-instance labels: **exact** active match only |
| Walk | Reverse/forward BFS starts only at the hovered display name (+ non-multi aliases) |

**Codebreaker:** Buffer → `useCodebreaker · h2` lights that hop instance and its
incident bands only — **not** Imports-column primary `useCodebreaker` or
primary→reducer/types/utils (those attach to the primary instance). Hovering
primary does not light hop-2 consumers (Buffer/Timer).

Ship spine-shortest-path / split-induction experiments were **rolled back** so
this single interim is the load-bearing multi-hop pin.

### 3c. Package label — reverse-path law (`L-pkg-*`)

```text
parents = pair parents of package (alias-aware)
activeFiles = ∪ reverseBFS(parent) for parent in parents   // includes parents
activeLabels = aliasExpand(activeFiles ∪ { package })
focusedBands =
  every fileEdge with both ends in activeFiles
  ∪ every externalEdge into this package from those parents
```

- **Do not** fixed-point expand into other packages from active files.
- **Do not** invent parents via shared rails.
- Exports\* nodes light **only if** they lie on a reverse path from a pair parent.
- Sibling branches that never reach a pair parent stay dim (e.g. `logger` under
  `main` when hovering `react` via Layout/Home/useUser, unless `main` itself is
  a parent — then only reverse from main, still not forward forks).

When `main` **is** a pair parent of `react`, reverse from main is `{main}` only;
forward forks like `logger` are **not** on that reverse path and stay dim.
Paths through Layout/Home/useUser reverse into App/main **are** lit.

### 3d. File spine (`L-spine`)

Treat as file seed for the hub focus file (display name of File category /
`meta.startId`).

### 3e. Multi-instance aliases (`L-alias` / `L-instance-local`)

`nodeRef` maps display name → `{ kind, id }`. **Non-multi-instance** file labels
that share the same `id` may still expand together. Labels matching
`path · hN` are **instance-local** (interim — see §3b′): they do **not** expand
to other instances of that path id.

### 3f. Rails (`L-rails`)

Never in `activeLabels` / `focusedBandKeys`. Strip at graph build.

---

## 4. Drawn-band inventory

After polish (or simulated from payload + pairs):

| Kind | Source | Key |
| ---- | ------ | --- |
| **carbon** | Payload links that are non-rail, not pad-scaffold, not pair-covered direct External attaches | `source\0target` |
| **straighten** | Every `externalStraightPairs` entry (authoritative External display) | `ext:parent\0packageName` |

Undrawn pair Carbon links are **not** drawn bands. Apply classifies **every**
drawn band as **focus** or **dim** (no third state). Pad-bands never focus.

### 4a. Observation harness (tests)

Do **not** pin blue tracks with Carbon mounts or screenshots as the primary
oracle. Use `observeHubFocus` / `observeHubFocusApplied` in
`focusHarness.ts`:

| Layer | Observable |
| ----- | ---------- |
| Plan | `activeLabels`, `focusedBandKeys` |
| Drawn inventory | `listDrawnBandsFromPayload` keys |
| Classify | every inventory band → `focus` \| `dim` |
| Apply (MiniEl) | `atlas-alluvial-carbon-link-focus` / `-dim` on those paths |

Invariant pin (`focusHarness.test.ts`, fixture `fixtures/codebreaker-focus`):
Buffer hover → **primary** `index→useCodebreaker` drawn band is **dim**;
Buffer→`useCodebreaker · hN` is **focus**. Hop instance must not activate the
Imports-column primary (L-instance-local).

### 4b. Browser e2e (Artillery-style)

When MiniEl is not enough, run **real Carbon** under Playwright:

| Piece | Path |
| ----- | ---- |
| Mount page | `/focus-e2e` (`src/pages/focus-e2e.astro`) |
| Boot hook | `window.__ATLAS_FOCUS_E2E__` (`focus/e2e/focusE2eBoot.ts`) |
| Spec | `src/client/focus/e2e/focusCarbon.e2e.test.ts` |
| Command | `npm run test:e2e:focus` (not in default `npm test`) |

Observable: `dumpBands()` reads `atlas-alluvial-carbon-link-focus` / `-dim` on
live `path.link` after `hoverFile(Buffer)`. Same Buffer sibling invariant as §4a.

---

## 5. CSS class contract

Under holder class `.ui-alluvial-label-dimming`:

| Target | Focus class | Dim class / rule |
| ------ | ----------- | ---------------- |
| Label `g.node-group` | `ui-alluvial-label-focus` | non-focus titles → opacity 0.3 `!important` |
| Carbon `path.link` (non-pad, non-straighten) | `atlas-alluvial-carbon-link-focus` | `atlas-alluvial-carbon-link-dim` |
| Straighten External | `atlas-alluvial-external-straight--focus` | non-focus straighten → opacity 0.3 `!important` |
| Pad bands | never focus | stay undrawn / pointer-events none |

Clear Carbon/polish inline `stroke-opacity` / `fill-opacity` / `opacity` on apply so CSS wins (bands are filled ribbons; dim/focus use fill-opacity parity).

**Removed (post foundation):** `ui-alluvial-external-pkg-focus` blanket
“dim entire Carbon tree” — package reverse-path plan lights the correct subset
of file bands; blanket dim is no longer product law.

Drill accent: `atlas-alluvial-drill-target` (unchanged; orthogonal to focus plan).

---

## 6. Explicit non-laws

| Non-law | Why |
| ------- | --- |
| **No Carbon `sourceLinks` / `targetLinks` as product connectivity** | Poisoned by shared rails |
| **No rails in logical focus** | Topology for depth only |
| **No fixed-point multi-package expand** | `react-dom` → main → all packages → Layout/Home is wrong |
| **No fileHub membership rewrite for hover** | Geometry matrix is orthogonal |
| **No treating undrawn pair Carbon links as focus targets** | Display SoR is straighten |

---

## 7. Test matrix IDs

Pure plan (`logicalFocusGraph.test.ts`) cites these IDs in test names:

| ID | Case |
| -- | ---- |
| `L-band-file` | carbon `main→App` band only |
| `L-band-ext` | straighten `main→react` only (not react-dom sibling) |
| `L-file-main` | main label: full forward + main’s packages |
| `L-file-app` | App: spine-shortest-path ancestors∪descendants; not logger; not main→react-dom |
| `L-file-hook` | shared-hook shape: spine→shell→hook shortest path; co-importers dim |
| `L-file-timer-crosscut` | Timer-like: induced halves only; index→hook cross-cut band dim |
| `L-pkg-react` | reverse-path union from all react parents |
| `L-pkg-react-dom` | parents of react-dom only (main); not Layout/Home unless reverse-ancestors |
| `L-pkg-zod` | multi-parent reverse unions |
| `L-instance-local` | multi-instance `· hN` does **not** id-alias to primary |
| `L-spine` | File spine = file neighborhood of focus |
| `L-rails` | rails never in activeLabels |

Apply / adapter:

| ID | Case |
| -- | ---- |
| `D1`–`D5` | drawn band focus\|dim completeness; pad never focus; clearFocus |
| `S1`–`S4` | Carbon/straighten seed mapping; rails never seeds |

Manual E5: demo-react-simple `main.tsx` — band main→App / main→logger /
main→react; labels main, App, logger, Home, useUser, react, react-dom, zod;
package react reverse tree via true importers.

---

## 8. Module map

```text
payload + pairs
    → buildLogicalFocusGraph
    → planFocus(seed) → FocusPlan
    → listDrawnBands (inventory)
    → applyFocusPlan(holder, plan, inventory)
```

One FocusPlan SoR. No parallel expand flags, package-only blanket CSS, or
Carbon connectivity as product truth.
