# Carbon tokens & design language (color)

```text
Status: current implementation
Purpose: one ownership model for shell, selection, status, and chart paint
Mechanism: g100 dump → bridge CDS overrides → product --atlas-* → chartPalette hex mirror
Revisit when: light mode, heatmap consumer, Carbon major theme upgrade, or brand hue change
```

Tracks **Sentinel visual grammar** (Carbon wrappers, zinc shell, selection chrome)
without Sentinel product domain and **without** Sentinel’s emerald brand.

## Brand & chrome (locked for agents)

| Role | Source | Notes |
| ---- | ------ | ----- |
| Shell base | Zinc steps on `--cds-background` / `--cds-layer-*` / text / border | Dark **g100 only** today — no light theme |
| Brand interactive | **Teal** (`--cds-interactive`, `--cds-background-brand`, button-primary) | **Not** Sentinel emerald; do not re-brand to emerald |
| Active selection | Purple product tokens `--atlas-select*` | Selection chrome ≠ brand teal; File spine / package terminators use select |
| Status / severity | `--cds-status-*` CDS presets | PASS/FAIL/WATCH never brand teal |
| Support | Aliases status (`--cds-support-*` → `var(--cds-status-*)`) | Sentinel support→status pattern |

Shell grammar also lives one line in [scope.md](./scope.md) (design language);
this file owns the **token layers**.

## Token layers

```text
g100 dump (--cds-* stock defaults)     leave dump block alone
        ↓
palette bridge on .cds--g100           zinc/teal CDS overrides; status presets;
                                       support → status aliases
        ↓
product --atlas-*                      select*, drill*, export*, import direction, terminators
        ↓
CSS call sites → var(--cds-*) / var(--atlas-*)
TS chart/SVG → chartPalette hex        must match CSS token values; no getComputedStyle in core
```

| Layer | Owner file | Owns |
| ----- | ---------- | ---- |
| FOUC gate | `src/styles/carbon-fouc.css` | `cds-*:not(:defined)` hide until CE register |
| g100 dump | `src/styles/carbon-g100.css` | Stock Carbon g100 token table — do not product-edit |
| Bridge + product tokens | `src/styles/atlas-bridge.css` | Zinc/teal CDS overrides, `--atlas-*`, support aliases |
| Product component CSS | `src/styles/components/product.css` | Shell, chart, catalog, inspect, splash (post-bridge rules) |
| Theme barrel | `src/styles/carbon-theme.css` | Ordered `@import` only (FOUC → g100 → bridge → product) |
| Entry | `src/styles/global.css` | Tailwind + carbon-theme barrel + motion |
| Chart hex mirror | `src/core/view/chartPalette.ts` | Carbon `color.scale` + SVG (scale, hops, spine, ribbon fallbacks) |
| Status geometry | `src/shell/statusIndicator.ts` | Shape + `--cds-status-*` via `statusColorCssVar` |

**Canonical hex for product tokens lives in the CSS bridge.** `CHART_PALETTE` must stay in lockstep for values that also paint in CSS. Import **hop** ladders are TS-only (no CSS hop tokens); terminator/drill CSS cousins share mid/near cyan steps only.

Historical scale export `TEAL` re-exports a subset of `CHART_PALETTE` for minimal churn — prefer `CHART_PALETTE` at new call sites.

Do **not** land a second TS palette (`palette.ts`) or a parallel `atlas-tokens.css` — single bridge + `chartPalette` only.

## Direction tokens (import / export UI)

| Token | Typical use |
| ----- | ----------- |
| `--atlas-import` | Inspect form-tri import markers; aliases brand teal (`--cds-interactive`) — **not** `--cds-status-blue` |
| `--atlas-export` | Export bands, form-tri export markers, outbound catalog yellow chips |
| `--atlas-export-pkg` / `--atlas-export-other` | Deeper export hop yellow ladder (mirrors `CHART_PALETTE` / `TEAL`) |
| `--atlas-import-term*` / `--atlas-export-term*` | Alluvial terminator chrome (contrast wraps) |

## Selection purple (`--atlas-select*`)

| Token | Typical use |
| ----- | ----------- |
| `--atlas-select` | Labels / icons on zinc |
| `--atlas-select-strong` | Borders, alluvial stroke, File spine stroke (`CHART_PALETTE.selectStrong`) |
| `--atlas-select-deep` | Filled spine bar |
| `--atlas-select-soft` / `--atlas-select-ring` | Tile wash / focus ring |

`--cds-status-purple` is aligned to `--atlas-select-strong` (`#a78bfa`) so status purple and selection chrome do not drift.

## Status vs brand

- **Status** paints from `--cds-status-*` (red / orange / yellow / green / blue / purple / gray).
- Shell maps support to those same status tokens (error/success/warning/info).
- `statusIndicator` contract: never brand teal/emerald for PASS/FAIL; hollow yellow diamond is locked for indication WATCH.

## Chart label chips (footgun)

Carbon **g100** on `.cds--chart-holder[data-carbon-theme=g100]` sets:

| Token | g100 chart-holder value | Meaning for alluvial defaults |
| ----- | ----------------------- | ----------------------------- |
| `--cds-layer-inverse-absolute` | `#ffffff` | White label chip |
| `--cds-layer-01-absolute` | `#000000` | Black label text |

Atlas paints **light text on dark zinc chips**. Do **not** drive `rect.node-text-bg` from `--cds-layer-inverse-absolute` (resolves to white under the holder). Chart also forces `--cds-layer-01: transparent` on `.ui-carbon-chart`, so shell layer tokens are unusable for chips.

**Current paint:** pin zinc-900 (`rgb(24 24 27 / 0.92)`) on `rect.node-text-bg`; selection/drill chips use `--atlas-select-deep` / `--atlas-drill-deep`. See `components/product.css` alluvial label rules.

## Shade modification (heatmap precedent)

Prefer **`color-mix`** or opacity on existing status/product tokens when a wash is needed — do not invent new hues per surface.

Example (yellow caution chips): `color-mix(in srgb, var(--cds-status-yellow) 28%, #000)`.

Full heatmap / severity-ramp helpers are **not** landed yet; when a consumer appears, ramp opacity on `--cds-status-*` (Sentinel tile/heatmap pattern) rather than a parallel hex table.

## Out of scope (do not invent here)

- Light mode / non-g100 themes
- Emerald brand (Sentinel-only)
- Runtime `getComputedStyle` in pure core / CLI
- Geometry, focus, or mass-matrix retcons while touching color
- Full Sentinel domain chrome (tables, htmx bridges, etc.)

## Code map

| Concern | Path |
| ------- | ---- |
| Theme barrel (compat) | `src/styles/carbon-theme.css` |
| FOUC gate | `src/styles/carbon-fouc.css` |
| g100 dump | `src/styles/carbon-g100.css` |
| Palette bridge | `src/styles/atlas-bridge.css` |
| Product components | `src/styles/components/product.css` |
| Global entry | `src/styles/global.css` |
| Chart hex | `src/core/view/chartPalette.ts` |
| Status presentation | `src/shell/statusIndicator.ts` |
