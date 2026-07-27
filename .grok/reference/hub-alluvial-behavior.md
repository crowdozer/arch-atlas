# File-hub alluvial — behavioral matrix

**Status:** current implementation (cascade-purity, multi-instance dual-path,
External straighten pairs, reverse terminator chrome)  
**Code SoR:** `src/core/view/fileHub.ts`, `src/core/catalog/deepest.ts`,
pad/paint helpers in `src/core/view/alluvial.ts`, polish in
`src/client/alluvialPolish/`  
**Tests that lock membership:** `src/core/view/hubOrientation.golden.test.ts`,
parts of `fileHub.test.ts` / `alluvial.test.ts` / `alluvialPolish/alluvialPolish.test.ts`  
**Try/fail journal (not law):** [hub-alluvial-field-notes.md](./hub-alluvial-field-notes.md)  
**Hover focus / highlight (orthogonal):** [hub-focus-behavior.md](./hub-focus-behavior.md) —
LogicalFocusGraph FocusPlan; do **not** retcon this geometry matrix to fix hover.

This document is the **working behavioral contract** for dual-side file hub
layout and mass pull-in. It is not a redesign brief. Update it only when product
intent for hub columns deliberately changes — not when a bug fix drifts behavior.
For "why did we try X and reject Y?", use the field notes — do not grow this
matrix into a changelog. **Focus/highlight law lives in hub-focus-behavior.md**
(pairs + non-rail file edges); it must not rewrite pad/rail membership.

---

## Engineering rule (non-negotiable)

**When adjusting the alluvial, respect this matrix.**

| Do | Do not |
| -- | ------ |
| Keep requested behavior updates **surgical** (one column, one link rule, one pad/paint path). | “Fix” the matrix (or goldens) to **obey** a cascade that broke another column. |
| If a tweak of A moves B, treat B’s change as a **regression** unless the request explicitly changed B. | Expand membership, distance, or External topology to paper over geometry glitches. |
| Prefer diagnostics (category, free-source?, inbound links, path length) before rewriting distance/placement. | Assume “looks under External” means category is External (Carbon free-source layers ≠ headers alone). |
| When intent *does* change, update this doc **and** goldens in the same change set, with explicit rationale. | Silently re-home packages, seeds, or reverse rings as a side effect of a polish fix. |

**Cascade policy:** a one-column request must not fork product law on other columns.
If tests fail in a way that would redefine Imports / Exports / External membership
or seed placement, **stop and surface the fork** — do not rewrite the matrix to
match the new code.

---

## 1. Column layout (L → R)

| Column category | Side of File | Membership (hard law) | Distance rule |
| --- | --- | --- | --- |
| `Export hop N` … `Export hop 2` | Left (outer → inner) | Files that **import toward** focus (reverse BFS) | Shortest reverse BFS (`fileDistances` on imported-by adj) |
| `Exports` | Left, dist 1 | Direct importers of focus | Reverse dist = 1 |
| **`File`** | Center | Focus only | — |
| `Imports` | Right, dist 1 | Outbound **file** deps of focus (**seeds** always here) | Seed clamp → always 1 if focus→file edge exists |
| `Import hop 2` … `Import hop N` | Right (inner → outer) | Outbound **file** deps **not** seeds (deeper cascade) | Longest forward path (`fileLongestDistances`), then min(dist, hub radius) |
| **`External`** | Far right | `package` / `unresolved` / overflow buckets only — **never files** | Not hop-dist; always one category |

`categoryOrder` includes only categories that still have nodes after linking
(empty sides omit columns). Default viz radius: `HUB_DEFAULT_MAX_DEPTH = 3`.

Hard product law (membership purity):

1. **Imports / Import hop k** — only what the focus **imports** (outbound files).
2. **Exports / Export hop k** — only what **imports from** the focus (inbound).
3. **External** — pure package/unresolved leaves (and their overflow buckets).

---

## 2. Edge orientation vs product language

| Concept | Meaning |
| --- | --- |
| Graph edge `A → B` | **A imports B** |
| Display band `source → target` | Same orientation in the sankey |
| **Exports*** columns | “Who uses me” — links still run **importer → imported** (into File) |
| **Imports*** columns | “What I use” — links run **importer → imported** (File → deps) |
| **External** | Package leaves as **sinks**: `parent → package` |

**Code naming trap (not product):** `addImportRings` builds the **Exports** side;
`addExportRings` builds the **Imports** side. Do not “fix” names casually —
call sites and mental models are entangled.

---

## 3. Pull-in matrix

### 3a. Exports side (reverse)

| Node kind | When included | Category | Links | Pad rails |
| --- | --- | --- | --- | --- |
| Direct importer file | Focus has inbound file edge | `Exports` | `importer → File` (seed mass) | If radius ≥ 2 and no outer parent: free-source pad via **`·out-rail·hN`** |
| Multi-hop reverse file | Within radius on reverse BFS | `Export hop d` | `outer → inner` (mass split from inner) | Same free-source pad if no outer parent |
| Folder collapse | Only `hubRadius === 1` **and** importer fan-in > 12 | Export-side modules helper | Aggregates → File | N/A multi-hop |
| Packages on this side | **Never** (file-pure cascade) | — | — | — |

Distance: **shortest** reverse BFS (first visit wins). Diamonds can collapse
alternate reverse paths — known asymmetry vs import side.

### 3b. Imports side (forward files)

| Node kind | When included | Category | Links | Pad rails |
| --- | --- | --- | --- | --- |
| **Seed** = focus direct file dep | Always if focus→file edge | **`Imports` (forced dist 1)** | **`File → seed` always direct** | **No** File→seed rails |
| Non-seed file in import tree | Reachable by longest path from focus, not a seed | `importHopCategory(min(rawLongest, radius))` | Mass from kept parent at `displayDist − 1` when real edge exists | `padBetween` / `padFromFile` helpers exist; seeds must not use File→seed pads |
| Overflow “+N more” | Ranked cut at maxPerHop | Same hop category as that dist | Bucket display name | — |

**Seed clamp + multi-instance (dual-path law):**

```text
seed instance: focus file dep → always an instance at dist 1 with File → seed
edge expansion: for each instance of A at dist d < radius, each edge A→B
  creates instance of B at d+1 (even if B is also a seed)
```

So focus → logger (seed on Imports) **and** analytics → logger · h2 (second
instance) can both exist. Fingerprinting later may merge same-code instances.
**Packages still collapse** to one External node per package id.

**Geometry caveat:** an Imports node can still *look* External-adjacent if Carbon
path length from free sources deepens its column. Category membership tests can
be green while screenshots look wrong — diagnose geometry before changing clamp.

### 3c. External (packages)

| Source of package | Link pattern | Free source? |
| --- | --- | --- |
| Focus package/unresolved out-edge | **`File → [in-rails] → package`** | No |
| Package of a kept import-tree file | **`parentFile → [in-rails] → package`** | No |
| Same package from focus + tree | One External node; extra parents link in | No |
| Overflow | Bucket on External; parents link to bucket | No |

**Topology hop (Carbon):** package nodes sit at hub dist
`externalDist = maxFileDist + 1` when there is at least one import-tree file
(`maxFileDist ≥ 1`); otherwise direct `File → package` (`externalDist = 1`).
Pads use existing `·in-rail·hN` so d3-sankey depth places External **one column
right of the deepest file Imports hop**. Without this, `File → logger` and
`File → ioredis` share depth and Carbon’s last-category-wins header paints
**External** over the Imports column.

Paint law: pure rail↔rail undrawn; **External package hop** bands
(`parent → in-rail → External` **and** direct pair-covered `parent → package`)
are undrawn and **redrawn as a straight** `parent → package` ribbon in polish
(`straightenExternalPackageBands`) so the Imports column does not show a package
kink and deepest-hop attaches do not double-paint. Straighten identity comes from
construction-time `meta.externalStraightPairs` (true residual parent→package
widths), **not** from BFS ancestry on shared `·in-rail·hN` (shared rails merge
multi-commodity pads; rail recovery invents parent×package cross-products).
When pairs are present, straighten **all** pair packages even with no in-rail
(pure File→pkg focus charts such as types.ts→zod). BFS + rail gate remain only
when meta pairs are absent. Straighten ribbons are interactive (hover/click)
like Carbon bands. **Out-rail free-source pads** (reverse column alignment into
Exports free sources) are undrawn past/into terminators. Rail **nodes** stay
hidden. Packages remain sinks.

**Terminator chrome (contrast with column family):**

| List | Nodes | Side | Wrap color |
| ---- | ----- | ---- | ---------- |
| `meta.terminators` | Reverse free sources / export-tree dead-ends (no kept outer reverse parent): single-column Exports, multi-hop padded free sources, outer rim | Exports* (yellow) | **Cyan** |
| `meta.exportTerminators` | Forward file leaves (no non-rail out) | Imports* (cyan) | **Yellow** |
| `meta.exportTerminators` | Packages / unresolved / External buckets | External | **Purple** (unique package chrome; future icons can target same class) |

**Never:** package free sources; packages on Export*; packages only reachable via
undrawn pure rail↔rail scaffolds (floating External / wrong left headers).

---

## 4. Distance / algorithm asymmetry

| Side | Function | Algorithm | Why |
| --- | --- | --- | --- |
| Exports (reverse) | `fileDistances` | Shortest BFS | Classic “who imports me” radius |
| Imports (forward files) | `fileLongestDistances` + **seed clamp** | Longest simple path, seeds forced to 1 | Expand format→types; avoid dual-path seeds deep with rail pads |
| External | N/A | Always outer category | Order past file import columns; not path length |

Changing either distance rule **cascades** membership and mass. Treat as a
product fork, not a polish tweak.

---

## 5. Mass at File

| Direction | What counts |
| --- | --- |
| Into File | Reverse importer edges only |
| Out of File | Focus → file seeds + focus → packages |
| Through import tree | Seed mass equal-split along kept file→file edges to children at `displayDist + 1` (package-bearing children preferred for scarce integer remainder) |
| Packages of deep files | **Residual** hub mass at parent after file→file routing, capped by raw package-edge weight — never invent free-source `types→zod` islands thicker than `users→types` |

Full Kirchhoff conservation is **not** product law; smoke tests may exempt
laterals / package emits.

---

## 6. Invisible rails + paint law

| Rail id | Side | Category | Role | Painted? |
| --- | --- | --- | --- | --- |
| `·out-rail·hN` | Export (left) | `Export hop N` | Free-source scaffold for short reverse paths when `radiusL ≥ 2` | Out-rail free-source pad bands undrawn; rail nodes hidden |
| `·in-rail·hN` | Import (right) | Import-side hop categories | External hop depth pads (shared stage rails); **seed path must not reintroduce** File→seed via rails | Parent→in-rail→External undrawn (straighten via pairs); pair-covered **direct** parent→package undrawn when pairs present; pure in-rail↔in-rail undrawn |

Client polish marks reverse free sources as **terminators** (cyan) even when
`radiusL === 1` (no out-rail pads) — chrome is not gated on multi-hop.

---

## 7. Carbon / d3-sankey geometry (orthogonal to categories)

| Mechanism | Effect |
| --- | --- |
| Column **x0** | d3-sankey placement (depth + **nodeAlign**), not `categoryOrder` |
| Header text at x0 | **Last** node.category among nodes at that x0 (Carbon overwrite map) |
| Free-source packages | Sit **leftmost** next to export free-sources → false “External” on left — packages must be **sinks** |
| Dual-path / pad rails | Extra path lengths so packages sit past file Imports |
| `categoryOrder` | Builder L→R rank; **does not override** sankey free-source layering |
| **nodeAlignment** | Carbon only maps `left` / `right`. Default (and ignored `center`) is **justify**: nodes with **no outbound links** snap to the **rightmost** column. Hub payloads must send **`left`** so leaf file seeds (logger) stay on Imports depth. Package pad alone is not enough under justify. |

Membership green ≠ screenshot correct. Goldens that care about **visible columns**
must use `layoutAlluvialLikeCarbon` (`src/core/view/alluvialCarbonLayout.ts`) —
same d3-sankey align + last-category-wins headers Carbon uses — not payload
category alone.

---

## 8. Tests that lock this matrix (fork risk)

| Case / suite | Locks |
| --- | --- |
| Golden A/B (stripe, next, zod) | Focus packages → External; intermediate pkgs never Export*; file deps → Imports* |
| Golden C (redis) | logger → Imports; ioredis → External; consumers → Exports |
| Golden D (errors.ts) | Importers of errors → Exports only |
| Topology: no package free sources | Packages always have inbound |
| Topology: users route logger | `cat === 'Imports'`, `File→logger`, not rail-only inbound; Carbon header Imports |
| Topology: redis post-Carbon | logger Carbon header Imports; ioredis External; not same depth |
| Topology: External kinds | Only package/unresolved/bucket |
| fileHub mass helpers | File in = reverse; File out = files + focus packages |
| Paint law tests | Pure in-rail scaffold undrawn; File↔rail carriers paint |
| External straighten pairs | Multi-parent shared-rail: pairs deny cross-product; BFS fallback only without meta |
| Deepest-hop direct undraw | main.tsx react: 4 pairs; direct useUser→react undrawn with pairs; straighten 4 |
| AdminFlags single reverse hop | `meta.terminators` includes Exports free source without out-rails |

**If a change flips membership (Imports ↔ Exports ↔ External) or seed placement
without an explicit product request, that is a product fork — surface it; do not
absorb it into the matrix.**

---

## 9. Load-bearing assumptions (honest gaps)

| Assumption | Confidence | Residual risk |
| --- | --- | --- |
| Consumers left / deps right / packages far right | High | “Imports/Exports” naming still confuses humans |
| Cascades pure (no packages on Export*) | High | — |
| Packages always sinks on External | High | Multi-parent packages share one node |
| Seeds always Imports + File→seed | Medium–high | Geometry can still mislead visually |
| Longest path only for non-seeds | Medium | Seeds that are also deep do not appear twice; long path through a seed may under-express |
| Reverse side stays shortest BFS | Medium | Export-side diamonds still collapsible |
| in-rail helpers unused for seeds | Medium | Future caller could reintroduce pad topology |
| “Looks like External” ⇒ category External | **False** | Carbon free-source layers ≠ category labels |

---

## 10. Minimal mental model

```text
[ free-source reverse files / out-rails ]
        → … → Exports → File → Imports → Import hop* → External packages
                              ↑              ↑
                         seed files    non-seed longest
                         File→seed     parent→child
                                       parent→pkg sinks
```

**Build order in code:** reverse rings → forward file rings (seed-clamped) →
focus packages External → tree packages External → drop unlinked nodes →
display category remap → `categoryOrder` → payload.

---

## Revisit when

- Product renames Imports/Exports or splits External.
- Distance algorithms are intentionally unified (longest both sides, etc.).
- Progressive stage insertion or multi-focus hubs change free-source geometry.
- Package leaves move off External by design.

Until then: **surgical fixes only; matrix is the constraint, not the post-hoc
description of whatever the last tweak did.**
