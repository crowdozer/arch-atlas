# Multi-language roadmap

Phased plan after **Gate A** (foundation + Python Level-1 Estimate). Companion:
[analysis-honesty.md](./analysis-honesty.md).

**Subordinate to** the canonical multi-host analyzer direction:
[analysis-protocol.md](./analysis-protocol.md) (L0–L4 stamps; Tree-sitter is
**syntax L1 breadth**, not universal semantics; Program is CLI-first for JS/TS).

## Shipped (Phase 0–1)

| Capability | Status |
| ---------- | ------ |
| Ingest admit + greying for known unsupported source exts | done |
| Python Level-1 extract + resolve (`python-import`) | done |
| `languageTags` includes Python | done |
| Exact `requiredEngines`: TS only for JS/TS; Python → missing engine | done |
| Fixture `fixtures/sample-python-project/` | done |
| Built-in UI demo `fixtures/demo-python-app/` | done |
| Astro frontmatter / `<script>` island Estimate | done |
| Exact island surface for Astro | later (missing engine honesty today) |

**Safe Estimate claims:** static observed import graph for JS/TS + Python + Astro script islands.
**Non-claims:** type-aware resolve, site-packages, importlib, pyright/Exact for Python; full SFC component graph / Astro Exact.

## Later phases (desire order adjusted for complexity)

### Phase 2 — Astro (shipped Estimate; Exact island surface later)

- ~~Admit `.astro`; extract frontmatter / script islands → existing JS/TS extract + resolve.~~ **done**
- Exact: reuse TS provider on script text with honesty “script islands only” — **not yet**; graph remount still estimate for `.astro`.

### Phase 3 — PHP

- Extract `use` / `require` / `include`; Composer PSR-4 as path-alias map.
- Exact: optional coarse public-symbol surface later — not phpactor in browser.

### Phase 4 — C family

- Estimate only: `#include "..."` among admitted files; optional include-root config.
- Honesty: **not** compile_commands-accurate; Exact → extension host / clangd inject.

### Phase 5 — Lua / Godot

- Clarify product ask: plain Lua `require` vs GDScript vs scene/resource atlas.
- Default: defer until the ask is crisp.

### Cross-cutting later

- Optional Python Exact: coarse def/class/`__all__` surface (still not pyright).
- Tree-sitter WASM workers if hand-rolled extractors rot.
- Mixed Exact/estimate band chrome refinements.
- `ImportedSurfaceProvider` inject for non-TS via VS Code host.

## Feasibility stance (summary)

| Language | Estimate | Exact (web/CDN) |
| -------- | -------- | --------------- |
| **Python** | L1 shipped | Coarse surface later; not pyright |
| **Astro** | L1 islands shipped | Exact islands later (missing engine today) |
| **PHP** | Medium-high (Composer) | Coarse surface later |
| **C family** | Medium-low (`#include` roots) | Defer |
| **Lua/Godot** | Ambiguous | Defer |
