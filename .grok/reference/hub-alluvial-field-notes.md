# Hub alluvial + Carbon — field notes (try / fail log)

**Status:** living engineering journal (not product law)  
**Companion contract (file-hub):** [hub-alluvial-behavior.md](./hub-alluvial-behavior.md) — **obey the matrix**; this file explains **why** the matrix looks the way it does and what we already burned ourselves on.  
**Package-hub geometry:** [hub-package-hub-behavior.md](./hub-package-hub-behavior.md) — separate projector (Export\* → External); not a retcon of the file-hub matrix.  
**Audience:** agents and humans about to touch file-hub, pads, External polish, or Carbon charts.

How to use:

1. Read the **matrix** for current invariants (file-hub vs package-hub as needed).
2. Skim the **quick diagnosis table** when a screenshot “looks wrong.”
3. Read the **episode log** only for the subsystem you are changing.
4. Prefer surgical fixes. Do **not** retcon the matrix to match cascade drift.

---

## 1. Mental model (layers)

```text
CodeGraph (observed edges)
    → projectFileHub payload (membership, semantic mass, pads, meta)
        → stage display-mass scale (layout channel only; default √)
            → Carbon / d3-sankey layout (depth, align, free-source columns)
                → stage polish (label semantic restore; straighten; terminators)
```

| Layer | Owns | Does **not** own |
| ----- | ---- | ---------------- |
| Graph | Who imports whom | Column labels |
| Payload / matrix | Categories, seed clamp, residual, rails topology, meta pairs | Pixel x-positions; presentation compress |
| Stage display-mass | Dual channel: layout `value` / pair `width` for Carbon thickness | Hub residual membership; Exact floors |
| Carbon / d3-sankey | Column **x0**, free-source layering, last-category-wins headers | Product “Imports means outbound” |
| Polish | Undraw pads, straight External ribbons, cyan/yellow/purple wraps; label mass restore | Inventing new parents for packages |

**Hard lesson:** membership green ≠ screenshot correct. Payload category tests can pass while Carbon free-source geometry paints the wrong header or merges commodities.

---

## 2. Quick diagnosis (screenshot → likely layer)

| Symptom | First check | Common false fix | Real fix class |
| ------- | ----------- | ---------------- | -------------- |
| Package under External header but co-located with Imports seeds | Path depth of package vs file leaves; `nodeAlignment` | Rewrite membership / move packages to Exports | Pad External to `maxFileDist+1`; force **`left`** align (not justify) |
| “External” header over Imports column | Carbon last-category-wins at that x0 | Change categoryOrder alone | Depth + alignment (categoryOrder does not override free-source layers) |
| logger / seed “deep” on Import hop with rail pads | Seed clamp; File→seed rails | Expand radius | Seeds always dist 1 + **direct** File→seed; no File→seed rails |
| analytics does not branch to redis/logger (also seeds) | Single node per path | Drop seed clamp | Multi-instance `(path, dist)`; packages still collapse |
| types/user→zod island thicker than users→types | Package mass source | Cap by raw only; residual = full arrived (double-spend) | Reserve-then-route: residual = min(arrived, rawPkg); scarce dual-spend if reserve would starve file children |
| External packages fan equally to every Imports file | Shared `·in-rail·hN` + straighten BFS | Split residual equally | `meta.externalStraightPairs` at construction; polish uses pairs |
| Straight External bands kink through Imports | Pad bands still painted | Leave kink | Undraw parent→in-rail→External; redraw straight parent→package |
| Reverse free source missing cyan (e.g. dashboard→AdminFlags only) | `radiusL === 1` terminator gate | Fake multi-hop pads | Terminators = all reverse free sources, not only padded multi-hop |
| Yellow-on-yellow / cyan-on-cyan terminator bars | Wrong class family | Invert colors again | Exports free sources **cyan**; Imports file leaves **yellow**; packages **purple** |
| Bands drawn past node ends / through free-source pads | Out-rail free-source paint | Thicker stroke | Undraw out-rail free-source pad bands past terminators |
| Pointed cusps / spikes past File on thick teal bands | Stroke centerline + huge stroke-width | CSS idle opacity / AA (E14 — wrong) | Filled ribbon path (E15); mass in fill not stroke-offset |
| Mid-size bands vanish next to huge peers (e.g. 5k vs 50k) | Linear link `value` in fixed sankey extent | Retcon residual / share floors into matrix | Stage display-mass (default √); semantic mass on labels + `getPayload` (E16) |
| Package free-sourced on far **left** | Package with no inbound | Put package on Exports | Packages always sinks; attach from shallowest instance |
| Tests green, UI wrong after Carbon change | Test uses payload categories only | Retcon goldens to cascade | Pipe through `layoutAlluvialLikeCarbon` |

---

## 3. Episode log (chronological, compressed)

Episodes are **working memory**, not blame. “Rejected” means we tried it or almost did, and it was wrong for the product.

### E1 — Naming trap: Imports vs Exports columns

- **Wanted:** consumers left, deps right.
- **Code names:** `addImportRings` builds **Exports** side; `addExportRings` builds **Imports** side.
- **Mishap:** “fix names” rewrites call sites and mental models; product law is membership, not function names.
- **Keep:** document the trap; do not casual-rename.

### E2 — Intermediate packages on reverse cascade

- **Wanted:** pure file cascade on Exports*.
- **Mishap:** packages as intermediate reverse hops → packages on Export* / wrong “who uses me.”
- **Landed:** file-pure reverse cascade; packages only External sinks.

### E3 — Focus packages on Imports (then External)

- **Early:** focus packages placed on Imports with files.
- **Later product:** packages need a pure **External** column (far right).
- **Keep:** External membership purity; never files on External.

### E4 — Seed clamp vs dual-path rails

- **Wanted:** focus file deps always on Imports with File→seed.
- **Mishap:** dual-path File→rail→seed faked deep placement; seeds shared one node and hop edges vanished.
- **Landed:** seed clamp dist 1 + direct File→seed; **no** File→seed rails.
- **Later (E10):** multi-instance for true dual-path branches under intermediates.

### E5 — Carbon free-source layers ≠ categories

- **Symptom:** “looks External” or wrong left headers while categories green.
- **Cause:** d3-sankey free sources sit at outermost depth; Carbon header = last category at x0.
- **Mishap:** treating categoryOrder as layout law; rewriting membership to paper over geometry.
- **Landed:** surgical rule + matrix; diagnose free-source / path length first.
- **Tests:** `layoutAlluvialLikeCarbon` goldens (align + last-category-wins).

### E6 — External co-located with Imports seeds

- **Symptom:** File→logger and File→ioredis same depth → External header paints over Imports.
- **Rejected:** justify alignment “to push leaves right” (actually snaps no-outbound leaves right and breaks seed columns).
- **Landed:**
  1. Pad packages to `externalDist = maxFileDist + 1` via shared `·in-rail·hN`.
  2. Hub `nodeAlignment: 'left'` (Carbon maps only left/right; center ignored → justify).

### E7 — Package residual mass / oauth zod island

- **Symptom:** types/user→zod thicker than users→types; floating island mass. Later (ship 519a0ccc): hidden pad mass still thickened Import-hop bars when residual double-spent full arrived onto both file children and packages (e.g. layout.tsx `redis.ts`).
- **Rejected:** invent unit package mass when residual 0; equal-split all children when remainder scarce (starved package leaves); residual = full **arrived** while still routing full `m` to file children (double-spend under intermediate Kirchhoff cases).
- **Early landed:** residual = mass **arrived** at path (not leftover after file children); budget min(residual, raw package edges); prefer package-bearing remainder when equal-splitting. Fixed free-source invent / zod island vs parent — still double-spent arrived onto file hops + packages.
- **Later landed (reserve-then-route):** reserve package budget `min(m, rawPkg)` **before** equal-split to file children; `residualMass = min(arrived, rawPkg)` (reserved share only). Prefer intermediate Kirchhoff when mass can cover both. **Scarce dual-spend exception:** if reserve would leave `fileMass = 0` with file children present, route full `m` to files **and** keep package residual so unit-weight External edges still appear.

### E8 — Straighten External past Imports kinks

- **Wanted:** straight parent→package ribbon; no Imports intermediate marker.
- **Mechanism:** undraw parent→in-rail and in-rail→External scaffolds; polish redraws straight band.
- **Related:** out-rail free-source pads undrawn so reverse terminators do not drag bands past ends.

### E9 — Terminator chrome contrast

- **Wanted:** dead-end affordance readable on column color family.
- **Mishap:** same-family wraps (yellow-on-yellow Exports, cyan-on-cyan Imports); inverted chrome; lost chrome after polish order.
- **Landed (contrast law):**
  | Side | Chrome | Class (historical names) |
  | ---- | ------ | ------------------------ |
  | Exports* free sources | **Cyan** | `atlas-alluvial-export-terminator` via `meta.terminators` |
  | Imports* file leaves | **Yellow** | `atlas-alluvial-terminator` via `meta.exportTerminators` |
  | External packages | **Purple** | `atlas-alluvial-package-terminator` |

  Field name `exportTerminators` is **historical** (forward leaves), not “export column.”

### E10 — Multi-instance dual-path (userService → analytics → redis/logger)

- **Wanted:** branch under intermediate files even when targets are also File seeds.
- **Rejected:** duplicate External package rows; drop seed clamp; fake same-column edges.
- **Landed:** file instances by `(path, dist)`; seeds stay dist 1; hop instances labeled `· h{d}` when multi; packages attach from **shallowest** instance; one External node per package id.
- **Future:** fingerprinting for same-code vs different-code (not implemented).

### E11 — Shared in-rail × straighten cross-product (userService External mesh)

- **Symptom:** nodemailer, zod, ioredis each connect equally to email, redis, types/user.
- **Truth:** residual allocation already parent-true; payload multi-commodity pads merge on shared `·in-rail·hN`.
- **Rejected:** private rails first; residual rewrites; pure weight-matching on shared rails (ambiguous under unit edges).
- **Landed:** construction-time `meta.externalStraightPairs`; polish prefers pairs; BFS fallback only when meta absent (simple fixtures).
- **Tests:** multi-parent shared-rail unit (BFS 9 vs pairs 3); userService meta denies false mesh.

### E13 — Direct deepest package attach double-paint + pure-direct vanish

- **Symptom A:** main.tsx → react shows 4 parents but **5 bands** (useUser thin+thick).
- **Cause A:** deepest file hop short-circuits `padBetween` to direct `file→pkg`;
  Carbon paints it; straighten also paints because package has rail inbound from
  shallower parents.
- **Fix A:** undraw **pair-covered** parent→package links (incl. direct), then
  straighten once from `externalStraightPairs`.
- **Symptom B:** types.ts → zod **missing** after A.
- **Cause B:** pure-direct packages have no in-rail inbound; straighten still
  required rail gate → undraw without redraw.
- **Fix B:** when pairs present, straighten **all** pair packages (no rail gate);
  rail gate remains for pairless BFS fallback.
- **Symptom C:** External straight bands ignore hover highlight / drill.
- **Cause C:** injected SVG not in Carbon alluvial-line events.
- **Fix C:** `pointer-events: stroke` + native mouseenter/leave/click wired to
  same label-focus + `handleLineClick` as Carbon bands.

### E12 — Single-hop reverse terminator missing cyan (AdminFlags)

- **Symptom:** `app/dashboard/page.tsx` on Exports is the only reverse free source; no cyan.
- **Cause:** terminator collection gated on `radiusL >= 2` (multi-hop pad only). With max reverse BFS hops = 1, `radiusL = 1` → empty terminators.
- **Landed:** terminators = **all** reverse free sources (no kept outer parent): single-column Exports, multi-hop padded free sources, outer rim. Pads still only when multi-hop.

### E13 — Deepest-hop direct package double paint (main.tsx → react / useUser)

- **Symptom:** demo-react-simple hub `src/main.tsx`: External **react** has 4 true parents but draws **5** bands; package ribbon thin+thick at once on deepest parent (`useUser`).
- **Cause:** `padBetween` short-circuits when `toDist === fromDist + 1` → direct `useUser → react`. That link is not an import pad scaffold → Carbon keeps painting it. Package still has in-rail inbound from shallow parents → straighten draws **all** `externalStraightPairs` including useUser → second ribbon (`Math.max(1, plan.width)` over residual stroke).
- **Rejected:** always force ≥1 rail hop for packages (topology/mass churn); drop direct parents from pairs (leaves Carbon residual width inconsistent with straighten); multi-instance rewrite (useUser not duplicated).
- **Landed:** when `externalStraightPairs` present, undraw **any** Carbon link matching a pair `(parent, packageName)` (including direct attaches), then straighten once. Scaffold undraw unchanged for pairless / BFS fallback charts.
- **Tests:** main.tsx react pairs length 4; direct useUser→react undrawn only with pairs; straighten plans for react length 4.

### E14 — Thick-band cusps misdiagnosed as opacity / AA (reverted)

- **Symptom:** hub File→settingsStore (and similar) showed **sharp teal cusps** past purple File spine and pointed bottom lobes on nearly full-height bands.
- **Wrong diagnosis:** Carbon stroke opacity / antialiasing “overdraw.”
- **Wrong fix:** CSS idle opacity ≈ 0.72 on alluvial links (ship merge `64f0b66`).
- **Outcome:** user confirmed **no visual fix**; main **reverted** (`cf6fa17`). Opacity only blends edge pixels; it cannot remove a geometric stroke-offset cusp.
- **Do not redo:** opacity-as-overdraw-fix for pointed thick bands.

### E15 — Thick bands: filled ribbon geometry (not stroke-width mass)

- **True cause:** Carbon + our polish painted bands as **centerline cubic**  
  `M x0,y0 C mx,y0 mx,y1 x1,y1` with `fill:none` and `stroke-width = link.width`.  
  When width ≈ node height and |Δy| ≠ 0, SVG stroke offset hits high-curvature evolute → cusps past the File face.
- **Rejected:** opacity CSS (E14); mass/membership rewrite; vendor Carbon fork; linecap/linejoin only; clip-only; fix only when File spine moves.
- **Landed:** `horizontalLinkRibbonPath` closed fill (top cubic y−w/2, bottom reverse y+w/2); unconditional `rewriteLinkRibbons` after File center; External straighten injects ribbons + `pointer-events: fill`; focus/pad CSS uses **fill-opacity** parity (0 / 0.3 / 0.95); recolor sets fill.
- **Keep:** hub mass matrix untouched; same `__data__` / class hooks; idle fill-opacity ~0.8.

### E16 — Display-mass scale (layout √ vs semantic integer)

- **Wanted:** readable band-size ratios under extreme semantic mass (e.g. 5k vs 50k LOC) without lying about mass or retconning the hub matrix.
- **Rejected:** share floors + renormalization; residual/membership rewrites; min-height product constant; putting compress in core projectors; shell toggle in v1.
- **Landed (stage only):** `scaleAlluvialDisplayMass` at mount — default **`sqrt`** on link `value` **and** `meta.externalStraightPairs[].width` (lockstep for straighten); clone layout channel only; `currentPayload` / `getPayload()` stay **semantic**; polish `semanticByNodeName` rewrites node labels to `Math.round` semantic integers post-draw.
- **Deferred / known gaps:** solitary / tiny-only charts still fill full height (empty-slack later); **tooltips may still show layout-scaled numbers** (no `semanticByLinkKey` wrap yet); no shell control.
- **Keep:** dual channel (semantic vs layout); matrix / residual / Exact floors untouched; do not “fix” readability by inventing residual membership.

---

## 4. Stable “do not redo” list

1. **Do not** fix Carbon geometry by expanding Imports/Exports/External membership.
2. **Do not** put packages on Export* or as free sources.
3. **Do not** File→seed via in-rails (seed clamp is intentional).
4. **Do not** recover multi-parent External pairs from shared-rail BFS alone.
5. **Do not** invent package residual when arrived mass is 0.
6. **Do not** use justify as the hub default “to push packages right.”
7. **Do not** trust payload-only goldens for column **headers** after Carbon changes.
8. **Do not** gate reverse terminator chrome on multi-hop pads only.
9. **Do not** retcon the matrix document to match an accidental cascade.
10. **Do not** leave pair-covered direct parent→package Carbon links painted when straighten will redraw them.
11. **Do not** duplicate External package nodes for dual-path (files may multi-instance; packages collapse).
12. **Do not** “fix” thick-band cusps with CSS opacity / AA — use filled ribbon geometry (E14/E15).
13. **Do not** push band-ratio readability into hub residual / membership — use stage display-mass (E16); keep straighten pair widths lockstep with layout.

---

## 5. Key code map (current)

| Concern | Path |
| ------- | ---- |
| Hub builder / residual / multi-instance / reverse rings | `src/core/view/fileHub.ts` |
| Pad scaffold undraw | `src/core/view/alluvial.ts` (`isImportPadScaffoldLink`) |
| Carbon-like layout for tests | `src/core/view/alluvialCarbonLayout.ts` |
| Display-mass scale (layout √ vs semantic maps) | `src/stage/displayMassScale.ts` + `mount.ts` |
| Label semantic restore / straighten / ribbons / terminators | `src/stage/polish/` (`@stage`) |
| Polish wiring / meta | `src/client/app.ts` |
| Terminator CSS | `src/styles/carbon-theme.css` |
| Membership goldens | `src/core/view/hubOrientation.golden.test.ts` |
| Matrix (law) | `.grok/reference/hub-alluvial-behavior.md` |

### Meta fields (payload → polish)

| Field | Meaning | Polish |
| ----- | ------- | ------ |
| `terminators` | Reverse free sources / export dead-ends | Cyan wrap |
| `exportTerminators` | Forward true leaves (files + packages) | Yellow file / purple package |
| `externalStraightPairs` | Construction parent→package widths | Straight External bands |

---

## 6. Fixture probes that caught us

| Focus file (demo-next-complex) | What it stresses |
| ------------------------------ | ---------------- |
| `src/lib/redis.ts` | Imports seeds + External package; reverse consumers; multi-hop reverse pads |
| `src/services/userService.ts` | Dual-path analytics→redis/logger; multi-parent External packages (ioredis/nodemailer/zod); residual tree packages |
| `src/features/admin/AdminFlags.tsx` | Single reverse hop only (`app/dashboard/page.tsx`); cyan terminator without pads |
| OAuth / types / users paths | Residual zod island vs parent file mass |
| Stripe / next entry points | Focus packages → External membership goldens |

---

## 7. How to extend this log

When a hub/alluvial/Carbon ship discovers a new footgun:

1. Add a short **episode** (symptom → rejected → landed).
2. Add one row to the **quick diagnosis** table if reusable.
3. Update the **matrix** only if product law intentionally changed.
4. Prefer a failing test that locks the law (not a screenshot-only freeze).

Keep episodes compressed. Link commits only when they encode irreversible decisions.

---

## Revisit when

- Fingerprinting merges multi-instance file hops by code identity.
- Carbon/charts version changes free-source or header semantics.
- Progressive stages / multi-focus hubs change pad topology.
- Private rails or non-shared package hops replace shared in-rails by design.

Until then: **matrix is law; this file is scar tissue.**
