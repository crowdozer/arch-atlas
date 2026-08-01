---
id: alluvial-engine-correctness-triage
kind: plan
state: implemented
authority: advisory
provenance: mixed

scope:
  - hub-alluvial
  - file-hub
  - package-hub
  - module-focus
  - topology-expansion
  - alluvial-payload-integrity
  - display-identity
  - sticky-package-focus
  - carbon-events
  - aggressive-smoke
applies_when:
  - alluvial branches or hop columns disappear unexpectedly
  - alluvial topology changes when weight axis changes
  - unit-mass parent has multiple dependency children
  - cyclic or diamond import graph reports the wrong longest depth
  - module folder and package share a display label
  - local file and package or unresolved target share a display label
  - package-hub opens fully dimmed or sticky hover restores the wrong package
  - Carbon node or band hover works through applySeed but not pointer events
  - catalog alluvial smoke passes despite wrong structure
  - adding payload integrity or topology-oracle tests
  - loading insight scenes or ?scene= triage fixtures
touches:
  - src/client/insightScenes.ts
  - src/client/insightScenes.test.ts
  - fixtures/scene-*
  - src/pages/scenes.astro
  - src/core/catalog/deepest.ts
  - src/core/catalog/deepest.test.ts
  - src/core/view/hubImportRings.ts
  - src/core/view/hubLinkUtils.ts
  - src/core/view/fileHub.ts
  - src/core/view/packageHub.ts
  - src/core/view/moduleFocus.ts
  - src/core/view/packageImporters.ts
  - src/core/view/alluvial.ts
  - src/core/view/catalogAlluvial.smoke.test.ts
  - src/stage/focus/bindAlluvialFocus.ts
  - src/stage/focus/bindAlluvialFocus.test.ts
  - src/stage/focus/e2e/
  - src/client/app.ts
  - vitest.config.ts
  - .grok/reference/hub-alluvial-behavior.md
  - .grok/reference/hub-package-hub-behavior.md
  - .grok/reference/hub-focus-behavior.md
invariants:
  - CodeGraph identity remains the source of truth; painted display labels are not durable entity identity
  - Every uncapped in-scope dependency expansion is represented, or an explicit overflow node accounts for it
  - Weight axes control ribbon magnitude and ranking, not uncapped topology membership
  - Alluvial links have positive finite values, distinct endpoints, and exactly one node per endpoint
  - Hub geometry and focus behavior remain orthogonal; do not rewrite column membership to make hover easier
  - Rails never enter LogicalFocusGraph focus propagation
  - Package sticky focus survives remount by stable package or unresolved identity
  - Omitted dependencies are not promoted to package architecture ends
open_questions:
  - Should scarce fan-out use positive fractional ribbon widths, or should topology and integer accounting be represented separately?
  - Should cyclic view depth be bounded path-instance expansion while catalog depth uses an SCC-aware metric, rather than one global longest-simple-path function?
  - Should payload integrity checks remain test-only or fail closed at projector boundaries in development and production?
  - Should the real-Carbon hover E2E become a required CI gate once its build is fresh and pointer-driven?
related:
  - architecture-triage-freeze
  - alluvial-nav-order-and-residual-mass
  - alluvial-top-pack-rename-split
  - segmented-relative-path-labels
realized_by:
  - path: src/client/insightScenes.ts
    note: Pre-phase 0 insight scenes (?scene=) + characterizations of known broken topology
  - path: fixtures/scene-*
    note: Minimal synthetic fixtures per triage defect
  - path: src/pages/scenes.astro
    note: Gallery page for shareable scene links
  - path: src/core/view/alluvialPayloadIntegrity.ts
    note: Phase 0 shared payload integrity oracle (test-owned)
  - path: src/core/view/alluvialPayloadIntegrity.test.ts
    note: Phase 0 deliberate-malform + healthy hub checks
  - path: src/core/catalog/deepest.ts
    note: Phase 1A fileLongestDistances simple-path fix + maxDepth bound
  - path: src/core/view/hubImportRings.ts
    note: Phase 1A pass hubRadius as maxDepth for forward longest path; 1B fractional fan-out
  - path: src/core/view/hubLinkUtils.ts
    note: Phase 1B fractional allocateProportional / allocateEqual
  - path: src/core/view/moduleFocus.ts
    note: Phase 2A claimName collision safety + omit omitted ends
  - path: src/core/view/packageImporters.ts
    note: Phase 2A edgeMatchesPackage excludes omitted
  - path: src/stage/focus/resolvePackageSeedName.ts
    note: Phase 2B resolve mounted package label from stable id
  - path: src/client/app.ts
    note: Phase 2B pendingPackageFocus by packageId + resolve on apply
  - path: src/stage/focus/bindAlluvialFocus.ts
    note: Phase 3 native DOM hover all nodes/links + Carbon event bus
  - path: src/stage/focus/bindAlluvialFocusEvents.test.ts
    note: Phase 3 CustomEvent adapter unit tests
  - path: src/stage/focus/e2e/
    note: Phase 3 physical pointer E2E + fail-closed build stamp
  - path: fixtures/adversarial-alluvial-matrix/
    note: Phase 4 asymmetric corpus
  - path: src/core/view/adversarialAlluvial.matrix.test.ts
    note: Phase 4 matrix + focus inventory closure
superseded_by: null
rationale_quality: full
---

# Alluvial engine correctness triage

Advisory phased plan from a source and test audit requested by the user. It
registers repair sequencing and acceptance evidence; it does not redefine the
file-hub, package-hub, or focus matrices.

## Problem

The nominal suite is broad, but several adversarial cases can produce a
conserved yet structurally false alluvial:

1. **Scarce fan-out drops valid branches.** Forward routing integer-splits a
   parent's mass, skips zero shares, and later removes the now-unlinked nodes
   (`hubImportRings.ts:339-397`, `hubLinkUtils.ts:92-120`,
   `fileHub.ts:321-333`). A unit-mass `focus→a`, `a→b`, `a→c` graph displays
   only one child despite no cap or overflow.
2. **Cyclic convergence under-reports depth.** `fileLongestDistances` globally
   memoizes depth while cycle eligibility depends on the active DFS stack
   (`deepest.ts:74-110`). For
   `root→a`, `root→b`, `a→b`, `a→c`, `b→a`, it reports `c` at depth 2 rather
   than the simple path `root→b→a→c` at depth 3.
3. **Display labels can overwrite entity identity.** `projectModuleFocus` keys
   links, `nodeRef`, and metadata by raw labels. A module folder `react`
   importing package `react` produces `react→react`, overwrites the module
   node, and emits a self-link (`moduleFocus.ts:84-110`).
4. **Sticky package focus carries the old projector's painted label.**
   File-hub collision decoration can produce a label such as
   `react.ts · package`; package-hub recreates raw `react.ts`, while
   `pendingPackageFocusLabel` reapplies the old label after remount
   (`hubExternalPackages.ts:100-114`, `app.ts:286-294,626-670`,
   `packageHub.ts:133-169`). The resulting package plan can focus zero bands.
5. **Omitted dependencies leak into package views.** Module focus and package
   matching exclude only file targets even though catalog ends deliberately
   exclude `omitted` (`moduleFocus.ts:57-66`,
   `packageImporters.ts:11-17`, `catalog/ends.ts:11-15`).
6. **Browser hover coverage can false-green.** The real-Carbon E2E is opt-in,
   accepts any pre-existing build, and invokes `applySeed` directly instead of
   dispatching Carbon events or physically hovering the SVG
   (`vitest.config.ts:16-20`, `focus/e2e/e2eServer.ts:54-67`,
   `focus/e2e/focusE2eBoot.ts:143-162`).

Conservation-only smoke is insufficient here: deleting a branch can preserve
the mass equations that the current catalog smoke asserts.

## Intent

Restore trust in the alluvial as a graph projection before expanding its
geometry:

- topology membership is deterministic, cap-aware, and independent of the
  selected width axis;
- display names remain readable but never substitute for stable graph identity;
- hover propagation is verified through the same event and remount paths users
  exercise;
- every repair lands with a small adversarial oracle and survives the full
  engine suite;
- the canonical matrices are preserved unless a ship uncovers a genuine
  product decision and pauses for the user.

## Assumption gate

- **Observed intent:** fix confirmed engine and focus correctness defects and
  make aggressive smoke capable of detecting structure, label, and propagation
  mismatches.
- **Explicit constraints:** use the established `/ship` engineer↔czar loop;
  catalog the plan; keep alluvial contract changes surgical.
- **Inferred assumptions:** one bounded ship per semantic risk is preferred over
  one large alluvial rewrite; adversarial tests should accompany the fixing
  ship rather than bless current output.
- **Load-bearing unknowns:** fractional scarce-mass representation; exact versus
  bounded/SCC-aware depth semantics; runtime versus test-only payload
  validation; CI policy for browser E2E.
- **Natural home:** topology and identity in pure `src/core`; event adaptation
  in `src/stage/focus`; navigation intent in `src/client`; cross-projector
  assertions in view/focus tests.
- **Conceptual delta:** one reusable payload integrity oracle and one stable
  identity handoff; avoid new parallel graph, focus, or label systems.
- **Consolidation opportunity:** reuse `claimName`, `nodeRef`,
  `LogicalFocusGraph`, `externalStraightPairs`, and existing catalog smoke
  instead of adding projector-specific validators.

## Phased ship plan

Run each work packet as its own `/ship` so research, implementation, czar review,
and any fix rounds remain attributable. Do not begin a dependent packet until
the preceding gate is green.

### Pre-phase 0 - Insight scenes (browser repro)

**Ship prompt**

> Add Artillery-style `?scene=` insight fixtures that land on each known
> alluvial defect so humans and later E2E can load them without hunting.

**Landed contract**

| URL                       | Packet | What to look for                                           |
| ------------------------- | ------ | ---------------------------------------------------------- |
| `/?scene=scarce-fanout`   | 1B     | root→a unit mass; only one of b/c on hop 2                 |
| `/?scene=cyclic-depth`    | 1A     | c depth 2 instead of long path depth 3                     |
| `/?scene=label-collision` | 2A     | module `react` + package `react` self-link / overwrite     |
| `/?scene=sticky-package`  | 2B     | painted `react · package` sticky fails package-hub remount |
| `/?scene=omitted-ends`    | 2A     | omitted `./hidden` leaks into module ends                  |

- Catalog: `src/client/insightScenes.ts` + gallery on upload step + `/scenes`
- Characterizations in `insightScenes.test.ts` assert **today's broken** shape
  so repair ships flip those expectations green
- Does **not** change geometry; only load + open recipes

### Phase 0 - Shared integrity guardrails ✅ landed

**Ship prompt**

> Add reusable aggressive alluvial payload invariants and apply them across the
> existing projector smoke corpus without changing product geometry.

**Landed**

- `src/core/view/alluvialPayloadIntegrity.ts` - test-owned collector + assert
  (structure-hard: unique names, endpoints, no self-links, positive values,
  nodeRef/color/rank/category coverage, focus + pair resolution, rail bucket
  law). Focus-graph rail exclusion via `assertFocusGraphNoRails` (no core→stage
  import).
- Wired into catalog smoke, file-hub, package-hub, module-focus tests.
- Deliberate-malform unit tests in `alluvialPayloadIntegrity.test.ts`.
- No production topology / goldens / projector geometry changes.

**Czar gate**

- No production topology or golden changed.
- The helper fails on deliberately malformed synthetic payloads.
- Targeted projector/focus tests and full `npm test` pass.

### Phase 1 - Topology correctness

#### Packet 1A - Cyclic and convergent depth ✅ landed

**Ship prompt**

> Make alluvial hop membership deterministic and correct for bounded cyclic and
> convergent import graphs; add a small exact oracle without introducing an
> unbounded longest-path search.

**Landed**

- `fileLongestDistances` explores every simple path (update on longer arrival;
  always DFS under stack). Fixes diamond+cycle under-report (c at 3 via
  root→b→a→c).
- Optional `{ maxDepth }` - hub forward rings pass `hubRadius` so search stays
  radius-bounded.
- Catalog tree-depth stays BFS via `fileDistances` / `importDepthStats` (not
  silently relabeled as longest simple path).
- Tests: cyclic diamond scene, adj permutation stability, brute-force oracle on
  small graphs, maxDepth bound, SCC termination, hub Import hop 3 multi-instances.
- **Not 1A:** unit-mass sibling fan-out still drops `c` ribbons (Phase 1B).

**Czar gate**

- No order-dependent depths.
- Radius-limited views include every eligible instance through the requested
  depth.
- Any catalog metric semantic change is explicit and documented; no silent
  relabeling of a different algorithm as “longest simple path.”

#### Packet 1B - Scarce fan-out ✅ landed

**Ship prompt**

> Preserve every uncapped dependency branch when arrived mass is smaller than
> fan-out while retaining honest ribbon accounting and explicit overflow.

**Landed**

- `allocateProportional` / `allocateEqual` use **positive fractional** shares
  (exact sum = budget). Integer largest-remainder no longer zeros uncapped
  siblings under unit mass.
- Forward import rings, reverse package-hub, multiHop parent split updated.
- Scarce dual-spend reserve law unchanged (file path + package residual).
- Characterizations: scarce-fanout keeps b+c; topology across weight axes;
  cyclic scene shows `c` on the hub.
- Rejected inventing integer mass=1 per child (silent mass creation).

**Czar gate**

- Conservation still holds within declared precision.
- No positive-width edge disappears merely because another sibling sorted
  first.
- Existing External/package reserve and overflow laws remain intact.

### Phase 2 - Stable identity and label safety

#### Packet 2A - Projector identity collisions and omitted targets ✅ landed

**Ship prompt**

> Make module/package/unresolved display collisions safe and keep omitted
> dependencies out of package architecture ends.

**Landed**

- `projectModuleFocus` claims focus label first, then each end via `claimName`
  (stable `nodeRef.id` = endKey / module id). No self-links on module=`react`
  - package=`react`.
- Omitted edges excluded from module ends (`toKind === 'omitted'` skip).
- `edgeMatchesPackage` rejects omitted (package-hub / Export Roots matching).
- `projectAlluvial` classic path also skips omitted (package|unresolved only).
- Tests: collision fixture, omitted-ends scene, integrity on collision payload.

**Czar gate**

- Stable IDs drill to the correct entity under every collision fixture.
- No broad relative-path-label redesign; `segmented-relative-path-labels`
  remains a separate exploratory concern.
- Shared integrity checks pass across all projectors.

#### Packet 2B - Cross-view sticky package identity ✅ landed

**Ship prompt**

> Carry package open intent by stable package/unresolved identity across
> file-hub to package-hub remounts, then resolve the mounted payload label before
> applying sticky focus.

**Landed**

- Host `pendingPackageFocus` stores `{ packageId, kind }` (not painted label).
- `resolvePackageSeedName` maps id → mounted display name from nodeRef / focus /
  pairs before `setDefaultSeed` + `applySeed`.
- Sticky-package scene: painted `react · package` no longer seeds package-hub;
  resolved `react` yields focused bands.
- Export Roots chrome selects by package id. Stage focus API still sole seed owner.

**Czar gate**

- Same-view navigation, unresolved packages, catalog Export Roots, and ordinary
  file/module navigation preserve their current lifecycle.
- No second focus state owner is introduced beside the stage API and host open
  intent.

### Phase 3 - Real event and browser smoke ✅ landed

**Ship prompt**

> Exercise the actual Carbon event adapter and physical SVG hover path, and make
> the focus E2E build freshness fail closed.

**Landed**

- `bindAlluvialFocusEvents.test.ts` - CustomEvent dispatch for node/line
  mouseover/out, package, rail exclusion, sticky restore, wrong event name /
  malformed datum fail-closed.
- Native DOM hover on all `g.node-group` + non-pad `path.link` (complements
  Carbon service bus; physical Playwright path).
- E2E physical pointer hover (not sole `applySeed`); applySeed remains
  diagnostic when physical binding fails.
- `ensureFocusE2EBuild` content-hash stamp (`.focus-e2e-build-stamp`); rebuild
  on mismatch; `assertNodeEngines('22.12.0')`.
- No CI service invented; `npm run test:e2e:focus` stays opt-in.

**Czar gate**

- A deliberately broken Carbon event name or datum shape fails a test.
- A broken DOM binding fails E2E even when `planFocus` remains correct.
- `npm test` and `npm run test:e2e:focus` both pass from the ship worktree.
- Do not invent a CI service; propose a CI/default-gate change separately if no
  existing owner exists.

### Phase 4 - Adversarial matrix and closure ✅ landed

**Ship prompt**

> Consolidate the landed alluvial fixes into a small adversarial smoke matrix
> across projectors, axes, depths, caps, identities, and focus seeds.

**Landed**

- Fixture `fixtures/adversarial-alluvial-matrix/` - single asymmetric corpus
  (fan-out + cycle, deep chain, many deps, module/package react, unresolved,
  multi-folder importers for sticky claimName).
- `adversarialAlluvial.matrix.test.ts` - integrity, axis topology stability,
  overflow under maxDeps=3, edge-order permutation → normalized payload equality,
  FocusPlan↔inventory closure (file/package/band), module 2A, sticky 2B resolve.
- Catalog record marked **`implemented`** (all phase gates met).

**Czar gate**

- Full pure suite and real-Carbon E2E pass from a clean worktree.
- Input permutation produces the same normalized payload.
- No golden update merely re-describes a previously confirmed defect.
- Remaining open questions are cataloged explicitly rather than hidden in test
  characterization.

## Standard agent handoff for every packet

1. **Research** loads `AGENTS.md`, the project preamble, the three hub behavior
   references, this catalog entry, and only the related catalog records named
   above. It reproduces the packet's failure and writes exact acceptance
   evidence.
2. **Engineer** adds the adversarial test with the smallest coherent fix, runs
   targeted tests plus `npm test`, commits as `engineer-bot`, and reports any
   contract pressure rather than editing matrices to green the suite.
3. **Czar** reviews the branch against base, reruns the packet oracle and full
   suite, treats missing aggressive coverage as an engineering finding, and
   returns blockers/majors/minors through the normal fix loop.
4. **Docs** runs only when behavior contracts or public test commands truly
   change. Bug fixes that restore existing matrices should not rewrite those
   matrices as new law.
5. **Catalog reconcile** records each landed commit/path in `realized_by` and
   keeps this record `active` or `partial` until every phase gate is met. Mark
   `implemented` only after Phase 4 closes.

## Verification ladder

Each packet should run the narrowest relevant files first, followed by:

```bash
npm test
npm run test:e2e:focus
```

The browser command is required only from Phase 3 onward and requires Node
`>=22.12.0`. A packet must not claim E2E green from the audited Node 20
environment.

## Reasoning

- **Guardrails first:** a shared integrity vocabulary prevents each projector
  from inventing a partial definition of “valid.”
- **Topology before identity before DOM:** later focus tests are meaningful only
  after the payload contains the correct branches and identities.
- **One semantic risk per ship:** cyclic depth, scarce mass, identity, and event
  wiring have different owners and failure modes. Separate diffs let czar
  distinguish a contract regression from an unrelated cascade.
- **Tests accompany the fix:** landing a red characterization phase would leave
  main knowingly broken; each fixing ship owns its adversarial acceptance case.
- **Stable ID, claimed label:** Carbon can continue keying painted nodes by a
  unique name, while graph identity remains in `nodeRef` and host state.

## Rejected alternatives + why

1. **One mega alluvial repair ship** - obscures which semantic change moved
   geometry and makes czar fix loops too broad.
2. **Update goldens to match current branch loss** - canonizes an implementation
   bug against the explicit multi-instance edge-expansion law.
3. **Give every scarce child integer mass 1** - preserves topology by silently
   inventing mass; unacceptable without an explicit product decision.
4. **Continue using display names as durable IDs** - collision suffixes are
   projector-local presentation and cannot survive remount reliably.
5. **Trust direct `applySeed` browser tests** - proves paint application but not
   Carbon event names, datum adapters, DOM binding, or pointer leave behavior.
6. **Fold pretty relative paths into this repair** - broader UX work does not
   solve entity identity and would violate the surgical triage constraint.
7. **Rewrite the hub matrices after fixes** - these defects violate current
   law; documentation should change only if a ship surfaces and resolves a real
   product choice.

## Open questions (explicit residual - not hidden in tests)

- **Carbon fractional tooltips:** fractional ribbons shipped (1B); product polish
  for tooltip/format rounding still optional UX, not a topology gate.
- **Catalog “deepest” metric:** remains BFS (`fileDistances`); longest simple
  path is view-expansion only. SCC-condensed catalog depth is a separate product
  choice if needed later.
- **Runtime payload fail-closed:** integrity oracle stays **test/czar only**
  unless a later decision promotes production validation.
- **CI for `test:e2e:focus`:** still opt-in; promoting to default CI is a
  separate policy change (no CI surface invented in this triage).
- **Module-focus band height after package click:** see
  `module-focus-band-height-after-drill` (minor, non-blocking).

## Revisit when

- A phase lands: reconcile `state`, `realized_by`, and the phase status here.
- A ship needs to change a hub behavior matrix rather than restore it: pause for
  a product decision and record the chosen alternative.
- Carbon changes event names, datum shape, fractional value handling, or Sankey
  self-link behavior.
- New projectors or visualization lenses consume `AlluvialPayload`; add them to
  the shared integrity corpus rather than copying assertions.
- Phase 4 passes on main: mark this record `implemented` and retain the repros
  as regression memory.

## Provenance

- **User:** requested an audit of alluvial tree building and aggressive smoke
  coverage, then requested a phased agent triage plan using ship loops and
  `/catalog`.
- **Agent:** inspected the core, stage, host, canonical behavior references, and
  tests; reproduced the topology, depth, label, and sticky-focus failures;
  proposed sequencing and acceptance gates.
