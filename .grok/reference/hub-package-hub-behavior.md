# Package-hub alluvial — geometry contract

**Status:** landed (package-hub dep view; ship `5247e3db` / merge on main)  
**Code SoR:** `src/core/view/packageHub.ts` (`projectPackageHub`)  
**Open policy:** `src/shell/atlasView.ts` (`package-hub`); host
`openPackageAsHub` in `src/client/app.ts`; shell project
`payloadForView` → `projectPackageHub`  
**Helpers (not open policy):** `src/core/view/packageImporters.ts`
(`edgeMatchesPackage`; `primaryImporterFile` = metrics/tests only)  
**Tests:** `src/core/view/packageHub.test.ts`; catalog smoke package-hub cases  
**Sibling (do not retcon):** [hub-alluvial-behavior.md](./hub-alluvial-behavior.md)
— **file-hub** column / mass matrix only  
**Focus (orthogonal):** [hub-focus-behavior.md](./hub-focus-behavior.md) §2a
sticky package seed; §3c reverse-path law  
**Scar tissue:** [hub-alluvial-field-notes.md](./hub-alluvial-field-notes.md)
(mostly file-hub/Carbon; package-hub reuses reverse pads + straighten pairs)

This document is the **geometry contract for package-hub** (dep-rooted reverse
export chain). It does **not** rewrite file-hub Imports / File / External law.
Update only when package-hub column membership deliberately changes.

---

## 1. Columns (L → R)

| Column category | Membership (hard law) | Distance / notes |
| --- | --- | --- |
| `Export hop N` … `Export hop 2` | Files on multi-seed reverse BFS rings from **all** direct package importers | Shortest reverse distance from any seed importer (same ring ranking / mass patterns as file-hub reverse) |
| `Exports` | Direct importers of the opened package (kept / overflow as implemented) | Conceptual dist 1; seeds for reverse rings |
| **`External`** | Opened package / unresolved **only** — single sink | Never a free source; never multi-package External tree |

`categoryOrder` includes only categories that still have nodes after linking.
Default viz reverse radius: `HUB_DEFAULT_MAX_DEPTH` (shared depth chrome with
file-hub; different projector).

**Omitted (hard product law):**

1. **No File spine** — package is the hub sink, not a center file.
2. **No Imports / Import hop\*** — package-hub is reverse-only into the dep.
3. **No multi-package External fan** — one opened dep chip as the sole External
   node (plus overflow buckets if any).

---

## 2. Product law (short)

1. Edge orientation remains A → B means A imports B (importer → package).
2. External is a **sink only** (no outflow from the package node).
3. `meta.externalStraightPairs` lists every kept importer → package edge so
   LogicalFocusGraph package seed lights reverse∪ across **all** pair parents
   (not a single primary importer).
4. Depth control is reverse radius (`maxDepth` / `vizMaxDepth`) — not a bound
   on graph scan.
5. `primaryImporterFile` is **not** the open policy; chips / Export Roots open
   package-hub via `projectPackageHub`.

---

## 3. Navigation vs selection vs focus

| Concern | Owner |
| ------- | ----- |
| Stack top | `AtlasView` `{ type: 'package-hub', packageId }` |
| Payload | `projectPackageHub(graph, packageId, …)` |
| Tree / catalog **file** selection | `nearestFileFocus` (underlying file-hub if any; may be `null`) |
| Sticky FocusSeed | `pendingPackageFocusLabel` → package-kind seed ([hub-focus-behavior.md](./hub-focus-behavior.md) §2a) |
| Export Roots chrome | `selectedPackage` from pending label |

**Selection chrome ≠ FocusPlan.** Sticky package seed is hover-restore /
open-time highlight; it does not force tree selection onto a primary importer.

---

## 4. Explicit non-laws

| Non-law | Why |
| ------- | --- |
| **No file-hub mount for package open** | Pre-package-hub path (file-hub at primary importer + sticky seed) is retired |
| **No rewriting file-hub matrix for dep view** | Package-hub is a separate projector; file-hub Imports/File law stays |
| **No inventing File/Imports columns on package-hub** | Geometry is Export\* → External only |
| **No treating `primaryImporterFile` as hub startId** | Metrics/tests helper only |

---

## 5. Module map

```text
Export Roots / package|unresolved drill
    → openPackageAsHub(packageId, label)
    → viewStack package-hub
    → projectPackageHub → payload (Export* → External + pairs)
    → mount + setDefaultSeed(package label)
```
