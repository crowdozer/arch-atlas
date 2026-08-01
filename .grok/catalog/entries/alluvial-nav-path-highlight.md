---
id: alluvial-nav-path-highlight
kind: idea
state: active
authority: exploratory
provenance: user

scope:
  - hub-alluvial
  - alluvial-navigation
  - path-trail
  - focus-highlight
  - spatial-memory
  - drill-stack
  - stage-focus
  - file-hub
  - package-hub
applies_when:
  - navigating alluvial bands feels disorienting
  - user loses track of where they came from after drill or band click
  - breadcrumb or trail for alluvial navigation
  - highlight the path taken through hub columns
  - navigation history vs hover FocusPlan
  - trail overlay after open package as hub or file drill
  - back-stack or provenance ribbon through imports exports external
  - disorientation during band traverse not fixed by sort order alone
  - path highlight chrome orthogonal to sticky package seed
  - visual memory of prior hub when remounting views
touches:
  - src/stage/focus/
  - src/stage/focus/logicalFocusGraph.ts
  - src/stage/focus/bindAlluvialFocus.ts
  - src/client/app.ts
  - src/shell/project.ts
  - atlas-alluvial-drill-target
  - .grok/reference/hub-focus-behavior.md
  - .grok/reference/hub-alluvial-behavior.md
  - .grok/reference/hub-package-hub-behavior.md
invariants:
  - Focus/highlight must not rewrite projector geometry or mass membership
  - Selection chrome ≠ FocusPlan (trail chrome, if any, should stay orthogonal too)
open_questions:
  - Trail of what - click history (stack of seeds), logical reverse∪forward corridor from origin, or nav-stack view frames only?
  - Persist across remounts (file-hub → package-hub → back) or only within one painted payload?
  - How does path trail relate to existing FocusPlan (band/file/package seeds) and sticky open-time package seed without double-dimming or fighting hover?
  - Visual grammar - dim non-trail, stroke/boost trail links, ghost prior-hub labels, or shell breadcrumb outside the chart?
  - Single origin (entry file) vs multi-hop breadcrumb of every drill step?
  - Interaction with multi-instance labels, External straighten, rails, and residual-thin bands after drill?
  - Does purple selection already carry enough “you are here,” or is the missing cue specifically “you came from there”?
related:
  - alluvial-nav-order-and-residual-mass
  - module-focus-band-height-after-drill
  - segmented-relative-path-labels
  - carbon-alluvial-scale-and-pan
  - interchangeable-atlas-lenses
realized_by: []
superseded_by: null
rationale_quality: full
---

# Alluvial navigation path highlight (“where I came from”)

Exploratory UX idea from user. **Not** product law. Adjacent to shipped hub
focus ([hub-focus-behavior.md](../../reference/hub-focus-behavior.md)) but aimed
at a different cue: **provenance of navigation**, not “what is connected to the
current hover seed.”

## Problem

Navigating alluvial bands (band click, package drill, hub remounts) can be
**disorienting**. After one or two hops the user loses track of **where they came
from** - which file/module/package was the prior locus, and which corridor led
into the current view. Existing spatial memory is weak because:

1. **FocusPlan is seed-relative, not history-relative.** Hover focus lights the
   connected tree of _this_ seed; leaving or remounting does not encode “the
   path I took to get here.”
2. **Drill / open remounts change the stage.** Package-as-hub and stack pops
   replace payload geometry; sticky package seed restores a highlight on open,
   but does not narrate the inbound path through prior columns.
3. **Band order stability** (see `alluvial-nav-order-and-residual-mass`) helps
   “where am I going next” spatially; it does not alone answer “how did I arrive.”

## Intent

Make arrival provenance **legible on the diagram** by **highlighting the path**
the user took (or the structural corridor that justified the drill), so band
navigation feels continuous rather than teleporting into a new chart.

Desired outcome (hypothesis): fewer “wait, how did I get here?” moments when
traversing file-hub → hops → package-hub and back, without inventing new mass or
rewriting membership geometry.

## Reasoning

- **Alluvial’s strength is path/corridor.** A trail highlight plays to the chart
  type instead of bolting on a separate map.
- **Cheap mental model:** “dim everything except the spine I used” is a known
  Sankey/alluvial pattern and reuses stage dim/focus paint channels if designed
  carefully.
- **Orthogonal to geometry law:** Like FocusPlan, trail chrome should **consume**
  drawn bands + logical edges - not retcon pads, rails, or straighten pairs.
- **Complements, does not replace:**
  - Sort stability → predictable stacking
  - FocusPlan → connectivity under cursor / sticky seed
  - Path highlight → **history / provenance** of the current navigation

## Rejected alternatives + why

| Alternative                                               | Why not first                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rely only on shell nav stack / back button                | Restores prior _view_ but does not show _which ribbon_ justified the hop while still on the chart                  |
| Rely only on FocusPlan hover                              | Answers “connected to this seed,” not “the route I took”; mouseleave restores sticky seed, not a multi-step trail  |
| Full graph overview / mini-map first                      | Heavier; does not fix in-chart disorientation during band-first exploration                                        |
| Rewrite column membership so origin always dominates mass | Geometry retcon; forbidden relative to hub matrices - chrome only                                                  |
| Text-only breadcrumb of file paths                        | Useful (see `segmented-relative-path-labels`) but weak for _flow_ provenance across Import/Export/External columns |

## Open questions

See frontmatter. Highest-load:

1. Is the trail **interaction history** or a **structural reverse path** from a
   sticky origin (closer to package FocusPlan reverse-path union)?
2. What is the **paint contract** vs FocusPlan so hover, sticky package seed,
   selection purple, and trail do not thrash?
3. Cross-remount: when package-hub replaces file-hub, is the trail a **ghost of
   the prior payload** or only labels still present on the new stage?

## Revisit when

- Field use shows disorientation persists after sort stability + sticky package
  seed + drill accents.
- Focus harness / LogicalFocusGraph gains a durable “origin seed” or nav-stack
  bridge that makes trail cheap.
- Multi-lens work (`interchangeable-atlas-lenses`) needs a shared focus region
  that survives alluvial ↔ other views - trail may be a special case of that.
- Module-focus height-after-drill bugs (`module-focus-band-height-after-drill`)
  are fixed, so trail experiments are not fighting remount mass glitches.

## Non-goals (for this record)

- Not a change to hub geometry matrices or residual mass accounting.
- Not a claim that hover FocusPlan is wrong or incomplete for connectivity.
- Not a mandate for a specific control or default-on trail.
