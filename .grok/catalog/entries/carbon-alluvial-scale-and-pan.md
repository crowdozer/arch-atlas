---
id: carbon-alluvial-scale-and-pan
kind: investigation
state: active
authority: advisory
provenance: mixed

scope:
  - alluvial-viz
  - carbon-charts
  - stage
  - chart-scale
  - viewport-pan
  - projection-bounds
  - custom-renderer
applies_when:
  - scroll wheel pan or drag to pan alluvial
  - bigger or unbounded charts
  - tall dense multi-hop hub
  - carbon alluvial height or width
  - overflow scroll stage chart
  - replace carbon charts alluvial
  - custom sankey or alluvial engine
  - chart performance with many nodes
  - options.height content-driven
  - when to leave carbon for viz
  - zoom bar canvas zoom alluvial
  - virtualize alluvial svg
touches:
  - src/stage/mount.ts
  - src/stage/height.ts
  - src/stage/carbonEvents.ts
  - src/stage/polish/*
  - src/stage/focus/*
  - src/core/view/alluvial.ts
  - src/core/view/alluvialCarbonLayout.ts
  - src/core/view/fileHub.ts
  - src/client/wireUi.ts
  - src/styles/carbon-theme.css
  - .atlas-stage overflow
  - AlluvialChart @carbon/charts
  - d3-sankey extent
invariants:
  - CodeGraph remains SoR; alluvial is a projection
  - Carbon Alluvial packs the full node/link set into a fixed sankey extent (not a virtualized canvas)
  - Projection bounds (depth, leaf budgets, drill) are the primary scale control — not pan chrome
  - Stage owns Carbon mount/polish/focus; hosts inject only
open_questions:
  - Soft perf ceiling for polish + SVG on real hubs (needs measurement, not only theory)
  - Whether horizontal scroll is product-wanted once multi-hop columns squeeze
  - Whether resize remount should preserve scroll/pan position
  - Min band height / padding readability targets as product constants
related:
  - dual-host-shell-stage
  - interchangeable-atlas-lenses
  - alluvial-nav-order-and-residual-mass
realized_by: []
superseded_by: null
rationale_quality: full
---

# Carbon alluvial scale, pan, and upgrade paths

**Status:** advisory investigation (research 2026-07-27). Not product law; not a
ship plan. Use when agents consider “bigger charts,” scroll/pan, or leaving Carbon.

**Code SoR for current wiring:** `src/stage/mount.ts`, `src/stage/height.ts`,
polish/focus under `src/stage/`, payload height in `src/core/view/alluvial.ts`.
**Carbon version evidence:** `@carbon/charts` ~1.27 Alluvial render (d3-sankey
extent from SVG size; `nodePadding` default 24).

---

## Problem

Dense hubs and multi-hop projections already press against a **viewport-capped**
chart height and **clipped** stage. It is easy to assume Carbon can zoom/pan like
cartesian charts, or that an infinite canvas is a small stage change. Wrong model
→ wasted work (CSS pan without content height; “unbounded” without projection
bounds; premature custom engine).

## Intent

Record what the **current Carbon + stage setup can and cannot buy**, with
**reasonable upper limits**, a **ladder of upgrades that stay on Carbon**, and
clear **exit criteria** for a custom alluvial engine — so future work picks the
cheapest path that matches the product need.

## Reasoning

### Mental model (layers)

```text
CodeGraph
  → bounded projection (depth, leaf budgets, drill neighborhood)
    → Carbon Alluvial (d3-sankey full layout into fixed width×height)
      → stage polish + focus (full holder DOM)
        → viewport chrome (height policy, overflow, optional pan)
```

Carbon is a **layout + paint engine for one finite payload**, not a map viewer.

### What Carbon Alluvial buys us

| Capability | Reality |
| --- | --- |
| Column layout from nodes/links | d3-sankey; hub forces `nodeAlignment: 'left'` |
| Chart size | `options.height` / `options.width` set the **layout extent** |
| Events | node/line click, render-finished (stage binds polish + focus) |
| Theming / a11y hooks | theme, aria label, tooltips (toolbar disabled) |
| Zoom / pan APIs | **No** — `zoomBar` / `canvasZoom` are other chart classes |

Adding nodes at fixed height **compresses** bands (padding + mass share the
extent). “Bigger” means **taller/wider extent**, not automatic overflow.

### What our stage wiring currently does

| Behavior | Effect on scale |
| --- | --- |
| `alluvialHeightPx` min(stage, room below fold) | Caps chart to viewport; dense hubs get thinner, not taller |
| `.atlas-stage { overflow: hidden }` | Tall SVG cannot scroll; intentionally clipped |
| Resize → full remount | Height reapplied; no scroll/pan state |
| Full polish every `RENDER_FINISHED` | Cost ∝ DOM size (links + nodes) |
| Focus graph over full payload | Memory/logic ∝ payload, not viewport |

### Reasonable upper limits (orders of magnitude)

These are **engineering heuristics** for planning, not measured SLAs. Revisit with
profiling on real fixtures.

| Scale (approx. live nodes after Carbon zero-value drop) | Expectation on current stack |
| --- | --- |
| **≲ 50–80** | Comfortable at viewport height; polish cheap |
| **~100–250** | Readable only with **content-driven height** + scroll; polish still OK on desktop |
| **~250–500** | Feasible if projection stays bounded and height scales; watch mount/polish jank; consider reducing polish work on idle |
| **≳ 500–1k+** full re-layout SVG | **Carbon full-graph approach likely wrong** for fluid interaction; prefer tighter projection or custom/virtualized engine |
| **Open-ended / whole-repo one canvas** | **Out of scope for Carbon Alluvial** — use depth, drill, top-N, or a different lens |

**Links** often dominate path paint cost more than node count; a star hub with
hundreds of External packages is as stressful as multi-hop file chains.

**Unbounded** (infinite pan while structure streams in) is **not** something
Carbon buys. Exploration scale lives in **projection** (`maxDepth`, leaf collapse,
drill into smaller neighborhood) — already partially true in `fileHub`.

---

## Upgrade paths (stay on Carbon)

Ordered cheapest → more work. Prefer earlier rungs until exit criteria fire.

### P0 — Projection bounds (already primary)

- Keep / tighten hub radius, leaf budgets, folder collapse, drill-in.
- **Buys:** fewer nodes/links without touching viz stack.
- **Does not buy:** readable geometry for a legitimately large *wanted* neighborhood.

### P1 — Content-driven height (and optional width)

- Replace viewport-cap-only height with something like  
  `max(viewportFloor, f(maxColumnCardinality) × (minBand + padding))`, still with a **hard ceiling**.
- Pass through existing `options.height` override in `mount.ts`.
- Optional `options.width` when multi-hop columns are unreadable when squeezed.
- **Buys:** readable “much bigger” charts for mid-scale hubs.
- **Touches:** `height.ts`, mount host `getHeightPx`, possibly payload defaults.

### P2 — Viewport scroll (native wheel)

- Chart area: `overflow: auto` (stage currently `hidden` by design).
- Chart SVG taller/wider than viewport from P1.
- **Buys:** scroll-wheel exploration with almost no interaction model invention.
- **Touches:** `carbon-theme.css` stage/chart rules; ensure bar controls stay fixed.

### P3 — Drag-to-pan shell

- Thin pointer handlers mapping drag → `scrollLeft`/`scrollTop` (or transform).
- Prefer scroll-linked pan over free CSS transform unless pinch-zoom is required.
- **Buys:** map-like feel; same layout engine.
- **Risks:** conflict with hover focus / click drill — need drag threshold or modifier.

### P4 — Resize / remount polish

- On remount: recompute content size; optionally restore scroll position.
- Avoid remount thrash if only pan changed (pan should not remount).
- **Buys:** less disorientation; still full Carbon layout on true size changes.

### P5 — Cost control while still Carbon

- Soft cap height even with P1 (e.g. max 4–8k px) + deeper projection trim.
- Defer nonessential polish passes; keep ribbons/rails correctness first.
- **Buys:** headroom before custom engine without rewriting layout.

**Not upgrade paths for Alluvial:** enabling Carbon `zoomBar` / `canvasZoom`.

---

## When to consider a custom alluvial engine

Consider **leaving full-graph Carbon Alluvial** when **any** of these hold:

1. **Product needs continuous pan/zoom over ≳ mid-hundreds of nodes** with
   interactive focus, and P1–P3 still jank after measurement.
2. **True LOD / virtualization** (only paint near viewport; stream columns) —
   Carbon always re-lays out the full graph.
3. **Geometry product law fights Carbon** beyond what polish can fix (free-source
   headers, justify vs left, residual straighten already expensive scar tissue —
   see hub field notes). A new engine is only justified if **owning layout** is
   cheaper than continuing to post-process Carbon.
4. **Second host** (e.g. VS Code webview) needs a thinner viz runtime and Carbon
   bundle + polish pipeline is too heavy — evaluate **shared layout IR** then
   host-specific paint, not a one-off canvas in web only.
5. **Non-sankey spatial metaphor** wins product-wise (see interchangeable lenses /
   heatmap / matrix) — may mean **another projection**, not a Carbon replacement.

Custom engine **does not** replace projection bounds. Graph-as-SoR and bounded
map catalog views remain; only the **paint/layout** layer changes.

### Rejected / deferred approaches

| Approach | Why reject or defer |
| --- | --- |
| Carbon zoomBar / canvasZoom for Alluvial | Wrong chart class; not wired to sankey extent |
| CSS transform pan alone without taller extent | Nothing to pan; viewport still packs dense hubs |
| Unbounded infinite canvas on Carbon | Full re-layout + full polish + full SVG; no virtualization |
| Expand membership / depth to “use” more height | Violates hub matrix / cascade purity; scale via projection caps, not fatter graphs for paint room |
| Premature custom engine for “scroll would be nice” | P1–P3 buy most of that on current stack |

---

## Open questions

- Measured frame time: mount + polish at 100 / 250 / 500 nodes on hub fixtures.
- Product min readable band height and max scroll height (feel constants).
- Horizontal scroll: needed, or keep multi-hop squeezed + depth control only?
- Accessibility: keyboard scroll of chart region vs custom pan affordance.

## Revisit when

- Real hub fixtures routinely exceed ~200–250 live nodes at default depth.
- Users (or ship goals) demand pan/zoom as a first-class investigation gesture.
- Polish scar tissue cost exceeds benefit of keeping Carbon layout.
- Extension/webview host forces a smaller viz runtime.
- Carbon major version changes Alluvial layout API (re-validate extent/padding).

---

## Retrieval one-liner

Carbon Alluvial = finite full-graph sankey in a fixed extent; bigger via
content height + stage scroll/pan; unbounded via projection not pan; custom
engine only after mid-hundreds jank or LOD/virtualization need.
