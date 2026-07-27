# Multi-language roadmap

Phased plan after **Gate A** (foundation + Python Level-1 Estimate). Companion:
[analysis-honesty.md](./analysis-honesty.md).

## Shipped (Phase 0–1)

| Capability | Status |
| ---------- | ------ |
| Ingest admit + greying for known unsupported source exts | done |
| Python Level-1 extract + resolve (`python-import`) | done |
| `languageTags` includes Python | done |
| Exact `requiredEngines`: TS only for JS/TS; Python → missing engine | done |
| Fixture `fixtures/sample-python-project/` | done |

**Safe Estimate claims:** static observed import graph for JS/TS + Python.
**Non-claims:** type-aware resolve, site-packages, importlib, pyright/Exact for Python.

## Later phases (desire order adjusted for complexity)

### Phase 2 — Astro (complexity win; dogfood)

- Admit `.astro`; extract frontmatter / script islands → existing JS/TS extract + resolve.
- Exact: reuse TS provider on script text with honesty “script islands only.”

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
| **Astro** | High (reuse JS/TS) | Reuse TS Exact on islands |
| **PHP** | Medium-high (Composer) | Coarse surface later |
| **C family** | Medium-low (`#include` roots) | Defer |
| **Lua/Godot** | Ambiguous | Defer |
