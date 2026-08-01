---
id: module-focus-band-height-after-drill
kind: investigation
state: active
authority: exploratory
provenance: user

scope:
  - module-focus
  - hub-focus
  - alluvial-navigation
  - band-height
  - label-collision
  - focus-restore
applies_when:
  - module alluvial band height shrinks after drill or click and does not restore
  - label-collision scene band goes thin after clicking package end
  - clicking back to module focus does not restore full ribbon height
  - FocusPlan leave or clear leaves mass geometry wrong
  - module remount after package-hub or package seed looks thinner
  - full-size module ends band becomes residual-thin after navigation
touches:
  - src/core/view/moduleFocus.ts
  - src/stage/focus/
  - src/client/app.ts
  - src/client/insightScenes.ts
  - fixtures/scene-label-collision/
  - .grok/reference/hub-focus-behavior.md
invariants:
  - Focus/highlight must not rewrite projector geometry or mass membership
  - Painted display labels are not durable entity identity (claimName)
open_questions:
  - Is the thin band focus dimming (opacity/plan) or a real payload remount with smaller mass?
  - Does drill to package open package-hub, or only apply package FocusSeed on the module chart?
  - Does “back” remount module-focus with a fresh payload, or reuse a stale stage with residual focus state?
  - Interaction with claimName suffixes after Phase 2A (module react vs react · package)?
  - Same symptom on non-collision module views (e.g. src/lib → nodemailer)?
related:
  - alluvial-engine-correctness-triage
  - alluvial-nav-order-and-residual-mass
  - hub-focus-behavior
realized_by: []
superseded_by: null
rationale_quality: full
---

# Module-focus band height does not restore after package click

User-reported **minor** bug after Phase 2A label-collision work. **Not** a
topology/triage blocker; register for a later surgical focus/nav pass.

## Problem

On `/?scene=label-collision` (module focus for folder `react`):

1. Initial alluvial band(s) render **full size**.
2. Click the **package** end `react` / `react · package` (the dep - not the
   local module spine / `react/index.ts` tree path).
3. Band(s) go **thin**.
4. Click back toward the module / `react/index.ts` does **not** restore full
   ribbon height.

Identity collision (2A) is fixed; this is a **post-click height / restore**
discrepancy.

## Intent

After focus or drill navigation within module-focus (and back):

- Band **geometry/mass** should match a fresh module-focus projection for the
  same seed, or
- If “thin” is intentional focus dimming, leaving the package seed / returning
  to module focus should restore the **full-height** presentation users saw on
  first open.

No rewrite of hub mass matrices; surgical focus/lifecycle fix only.

## Reasoning

Likely layers (diagnose before patching):

| Hypothesis                   | Why plausible                                                                                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. FocusPlan chrome**      | Package seed dims/thins bands; clear/remount fails to reset plan when returning to module focus. Orthogonal to projector mass (hub-focus-behavior).                                                                                                            |
| **B. View remount mass**     | Drill opens package-hub or reprojects with different weight axis/mass; “back” lands on module with wrong stack frame or partial remount.                                                                                                                       |
| **C. claimName / seed name** | After 2A, package painted name is `react · package`; sticky or default seed still uses bare `react` (or reverse) so restore hits zero bands / odd geometry. Related to **2B** sticky identity, but user path is module ends → package, not file-hub collision. |
| **D. Residual / dual paint** | Stage holds previous payload height or Carbon height string while links shrink; polish/height not recomputed on seed clear.                                                                                                                                    |

**Triage priority:** low. Topology packets (1A/1B/2A) remain closed for this
symptom. Do not fold into Phase 2B unless repro proves painted-label sticky is
the same owner; 2B is file-hub → package-hub remount, this may be module-only.

**Repro (shareable):**

```text
/?scene=label-collision
→ click package end (dep react / react · package)
→ band thin
→ click back toward module / react/index.ts
→ height not restored
```

## Rejected alternatives + why

1. **Retcon module-focus mass law to “always full height under focus”** - hides
   whether the bug is focus chrome vs projection; focus law says do not rewrite
   geometry to green hover.
2. **Treat as Phase 2A regression and reopen claimName** - 2A fixed self-links;
   this is restore/height after click, not initial identity overwrite.
3. **Ignore because “minor”** - still confuses users on the insight scene meant
   to prove collision safety; catalog so it is not lost between triage ships.

## Open questions

- Exact click path: package-hub push vs in-place FocusSeed only?
- Does `remountCurrentView` / `navigatePop` re-run `projectModuleFocus`?
- Reproduce without claimName collision (module folder ≠ package name)?
- Related to residual-mass / band-order experiments?

## Revisit when

- Starting Phase 2B sticky package identity, or any module-focus focus restore work.
- Touching `bindAlluvialFocus`, package open from module ends, or stage height.
- User confirms whether thin = dim-only or true thinner ribbons (payload values).
- After a fix: reconcile `state` → `implemented` and add `realized_by`.

## Provenance

- **User:** observed on label-collision scene post-2A; called out as minor,
  non-blocking for the engine correctness triage.
- **Agent:** registered as investigation; no fix in this catalog pass.
