# Hub alluvial focus — behavioral matrix

**Status:** foundational product law (ship `5ee2b6cf`)  
**Code SoR:** `src/client/focus/logicalFocusGraph.ts` (plan),  
`src/client/focus/displayInventory.ts` + `focusApply.ts` (drawn bands),  
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
| **band** (`display: carbon \| straighten`) | Hover a drawn ribbon | That edge only; endpoint labels (+ aliases) |
| **file** | Hover a file label | Ancestors = nodes on any **shortest path** File-spine→seed (forward on fileEdges; fallback reverseBFS if unreachable); ∪ forward descendants; packages only if pair parent ∈ hovered∪**forward** descendants |
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
targets    = aliasExpand({ hovered })
if fileSpineName known and some target reachable from spine (forward):
  ancestors = nodes on any shortest path spine → target (forward on fileEdges)
              ∪ targets
              // multi-instance: D = min dist among reached goals; paths to
              // goals with dist==D only; then aliasExpand so ·hN lights
else:
  ancestors = reverseBFS(hovered) on fileEdges   // fallback (includes hovered)
packageParentFiles = aliasExpand(descendants)    // NOT reverse-only ancestors
activeFiles = ancestors ∪ descendants
packages = { pkg | pair parent ∈ packageParentFiles }
activeLabels = aliasExpand(activeFiles ∪ packages)
focusedBands =
  every fileEdge with both ends in activeFiles (alias-aware)
  ∪ every externalEdge whose parent ∈ packageParentFiles
```

**Why shortest-path (not full reverseBFS):** shared hooks (e.g. `useCodebreaker`
imported by many game components) must not light every co-importer. Only the
hub start→seed chain (shortest paths) plus the seed’s forward deps light.
Longer paths through sibling consumers stay dim. Radius-1 reverse would still
light every direct consumer — wrong product.

**App vs main→react-dom:** hovering `App` lights spine-path ancestors (e.g. `main`)
but **does not** light packages whose only parents are reverse-only (main→react-dom).

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

### 3e. Multi-instance aliases (`L-alias`)

`nodeRef` maps display name → `{ kind, id }`. File labels that share the same
`id` expand together for both membership tests and band endpoint matching.

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

---

## 5. CSS class contract

Under holder class `.ui-alluvial-label-dimming`:

| Target | Focus class | Dim class / rule |
| ------ | ----------- | ---------------- |
| Label `g.node-group` | `ui-alluvial-label-focus` | non-focus titles → opacity 0.3 `!important` |
| Carbon `path.link` (non-pad, non-straighten) | `atlas-alluvial-carbon-link-focus` | `atlas-alluvial-carbon-link-dim` |
| Straighten External | `atlas-alluvial-external-straight--focus` | non-focus straighten → opacity 0.3 `!important` |
| Pad bands | never focus | stay undrawn / pointer-events none |

Clear Carbon inline `stroke-opacity` / `opacity` on apply so CSS wins.

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
| `L-pkg-react` | reverse-path union from all react parents |
| `L-pkg-react-dom` | parents of react-dom only (main); not Layout/Home unless reverse-ancestors |
| `L-pkg-zod` | multi-parent reverse unions |
| `L-alias` | multi-instance `· hN` expand |
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
