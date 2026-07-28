---
id: alluvial-engine-correctness-triage
kind: plan
state: partial
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
    note: Phase 1A pass hubRadius as maxDepth for forward longest path
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

### Pre-phase 0 — Insight scenes (browser repro)

**Ship prompt**

> Add Artillery-style `?scene=` insight fixtures that land on each known
> alluvial defect so humans and later E2E can load them without hunting.

**Landed contract**

| URL | Packet | What to look for |
| --- | ------ | ---------------- |
| `/?scene=scarce-fanout` | 1B | root→a unit mass; only one of b/c on hop 2 |
| `/?scene=cyclic-depth` | 1A | c depth 2 instead of long path depth 3 |
| `/?scene=label-collision` | 2A | module `react` + package `react` self-link / overwrite |
| `/?scene=sticky-package` | 2B | painted `react · package` sticky fails package-hub remount |
| `/?scene=omitted-ends` | 2A | omitted `./hidden` leaks into module ends |

- Catalog: `src/client/insightScenes.ts` + gallery on upload step + `/scenes`
- Characterizations in `insightScenes.test.ts` assert **today's broken** shape
  so repair ships flip those expectations green
- Does **not** change geometry; only load + open recipes

### Phase 0 — Shared integrity guardrails ✅ landed

**Ship prompt**

> Add reusable aggressive alluvial payload invariants and apply them across the
> existing projector smoke corpus without changing product geometry.

**Landed**

- `src/core/view/alluvialPayloadIntegrity.ts` — test-owned collector + assert
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

### Phase 1 — Topology correctness

#### Packet 1A — Cyclic and convergent depth ✅ landed

**Ship prompt**

> Make alluvial hop membership deterministic and correct for bounded cyclic and
> convergent import graphs; add a small exact oracle without introducing an
> unbounded longest-path search.

**Landed**

- `fileLongestDistances` explores every simple path (update on longer arrival;
  always DFS under stack). Fixes diamond+cycle under-report (c at 3 via
  root→b→a→c).
- Optional `{ maxDepth }` — hub forward rings pass `hubRadius` so search stays
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

#### Packet 1B — Scarce fan-out

**Ship prompt**

> Preserve every uncapped dependency branch when arrived mass is smaller than
> fan-out while retaining honest ribbon accounting and explicit overflow.

**Engineer acceptance**

- Pin unit-mass fan-out, unequal weights, package-reserve fan-out, and reverse
  package-hub analogues.
- Assert uncapped normalized topology is the same across supported weight axes.
- Assert every graph edge becomes a displayed instance edge or is accounted for
  by a cap bucket.
- Prefer positive fractional shares if Carbon and downstream invariants accept
  them; if they do not, stop on the product choice rather than duplicating mass
  silently.

**Czar gate**

- Conservation still holds within declared precision.
- No positive-width edge disappears merely because another sibling sorted
  first.
- Existing External/package reserve and overflow laws remain intact.

### Phase 2 — Stable identity and label safety

#### Packet 2A — Projector identity collisions and omitted targets

**Ship prompt**

> Make module/package/unresolved display collisions safe and keep omitted
> dependencies out of package architecture ends.

**Engineer acceptance**

- Pin module=`react` plus package=`react`, package=`(other ends)`, duplicate
  unresolved labels, and reserved overflow/rail-like text.
- Route all display names through the established collision claimant while
  retaining stable IDs in `nodeRef`.
- Exclude `omitted` from module ends and package matching.
- Ensure no projector can emit a self-link or overwrite the focus node's kind.

**Czar gate**

- Stable IDs drill to the correct entity under every collision fixture.
- No broad relative-path-label redesign; `segmented-relative-path-labels`
  remains a separate exploratory concern.
- Shared integrity checks pass across all projectors.

#### Packet 2B — Cross-view sticky package identity

**Ship prompt**

> Carry package open intent by stable package/unresolved identity across
> file-hub to package-hub remounts, then resolve the mounted payload label before
> applying sticky focus.

**Engineer acceptance**

- Replace durable use of painted display text with a stable node reference or
  equivalent existing identity.
- Add a host-level collision test that drills a decorated package label,
  remounts package-hub, applies its default seed, temporarily hovers another
  node, and restores the correct package on leave.
- Assert the sticky plan has at least one focused band and every expected pair
  parent participates.

**Czar gate**

- Same-view navigation, unresolved packages, catalog Export Roots, and ordinary
  file/module navigation preserve their current lifecycle.
- No second focus state owner is introduced beside the stage API and host open
  intent.

### Phase 3 — Real event and browser smoke

**Ship prompt**

> Exercise the actual Carbon event adapter and physical SVG hover path, and make
> the focus E2E build freshness fail closed.

**Engineer**

- Unit-dispatch exact node/line mouseover and mouseout `CustomEvent` detail
  shapes through `bindHubAlluvialFocusEvents`.
- Assert node, band, package, rail exclusion, clear, and sticky restore plans.
- In Playwright, use physical pointer hover/mouseleave on rendered node and band
  elements; direct `applySeed` may remain a lower-level helper but cannot be the
  sole E2E stimulus.
- Always build fresh, or validate a source/content hash before reusing `dist`.
- Run under the repository's declared Node `>=22.12.0`.

**Czar gate**

- A deliberately broken Carbon event name or datum shape fails a test.
- A broken DOM binding fails E2E even when `planFocus` remains correct.
- `npm test` and `npm run test:e2e:focus` both pass from the ship worktree.
- Do not invent a CI service; propose a CI/default-gate change separately if no
  existing owner exists.

### Phase 4 — Adversarial matrix and closure

**Ship prompt**

> Consolidate the landed alluvial fixes into a small adversarial smoke matrix
> across projectors, axes, depths, caps, identities, and focus seeds.

**Engineer**

- Add one intentionally asymmetric corpus with:
  - duplicate display labels backed by distinct IDs;
  - unit-mass fan-out;
  - a convergent cycle;
  - uneven depth;
  - package and unresolved collisions;
  - one capped overflow;
  - sticky package remount.
- Normalize and assert node/link tables rather than relying only on snapshots.
- For every drawn band and supported seed, assert FocusPlan/inventory closure:
  every band is focus or dim, focused keys exist in the drawn inventory, and
  rails never focus.

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

1. **One mega alluvial repair ship** — obscures which semantic change moved
   geometry and makes czar fix loops too broad.
2. **Update goldens to match current branch loss** — canonizes an implementation
   bug against the explicit multi-instance edge-expansion law.
3. **Give every scarce child integer mass 1** — preserves topology by silently
   inventing mass; unacceptable without an explicit product decision.
4. **Continue using display names as durable IDs** — collision suffixes are
   projector-local presentation and cannot survive remount reliably.
5. **Trust direct `applySeed` browser tests** — proves paint application but not
   Carbon event names, datum adapters, DOM binding, or pointer leave behavior.
6. **Fold pretty relative paths into this repair** — broader UX work does not
   solve entity identity and would violate the surgical triage constraint.
7. **Rewrite the hub matrices after fixes** — these defects violate current
   law; documentation should change only if a ship surfaces and resolves a real
   product choice.

## Open questions

- Confirm fractional ribbon support and tooltip/formatting behavior in Carbon
  before Packet 1B commits to it.
- Decide whether “deepest” outside the bounded view should mean SCC-condensed
  depth, bounded simple-path depth, or another honest cycle-aware measure.
- Decide whether production should reject malformed payloads or whether the
  invariant oracle remains a test/czar gate.
- Decide whether `test:e2e:focus` belongs in existing CI after Phase 3; no CI
  surface should be invented inside the repair packet.

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
