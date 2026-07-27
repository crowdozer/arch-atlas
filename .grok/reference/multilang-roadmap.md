# Multi-language roadmap

Phased plan after **Gate A** (foundation + Python Level-1 Estimate). Companion:
[analysis-honesty.md](./analysis-honesty.md).

**Subordinate to** the canonical multi-host analyzer direction:
[analysis-protocol.md](./analysis-protocol.md) (L0–L4 stamps; Tree-sitter is
**syntax L1 breadth**, not universal semantics; Program is CLI-first for JS/TS).

**Language landing (L1):** full checklist →
[language-landing-l1.md](./language-landing-l1.md).

## Debugging L1 (External weird → edges first)

When package External leaves, digests, or topology look wrong:

1. **Inspect L1 extract edges** for that language (string/comment/template
   false positives; missing real declarations).
2. Check **specifier normalize** policy (js-ts `resource-query-strip` only —
   not universal; python does not strip `?`/`#`).
3. Check **resolve family** (`familyForPath` / `RULES_BY_FAMILY`) before
   assuming hub polish, catalog ranking, or Exact is at fault.

Regression homes: `describe('L1 false-positive guards')` per extract module;
disk matrix `fixtures/golden-l1-*` + `src/core/parse/goldenL1.integration.test.ts`.
**Do not** use `demo-*` / hub orientation fixtures as L1 SoR.

## Shipped (Phase 0–1)

| Capability | Status |
| ---------- | ------ |
| Ingest admit + greying for known unsupported source exts | done |
| Python Level-1 extract + resolve (`python-import`) | done |
| `languageTags` includes Python | done |
| Exact `requiredEngines`: TS only for JS/TS; Python → missing engine | done |
| Fixture `fixtures/sample-python-project/` (smoke) | done |
| Product-agnostic `fixtures/golden-l1-{js-ts,python,astro}/` | done |
| Per-language L1 false-positive extract suites | done |
| Built-in UI demo `fixtures/demo-python-app/` | done |
| Astro frontmatter / `<script>` island Estimate | done |
| Exact island surface for Astro | later (missing engine honesty today) |

**Safe Estimate claims:** static observed import graph for JS/TS + Python + Astro script islands.
**Non-claims:** type-aware resolve, site-packages, importlib, pyright/Exact for Python; full SFC component graph / Astro Exact.

### Specifier normalize (js-ts only)

Vite/webpack resource queries (`?worker`, `?raw`, `?url`, `#hash`) are stripped
**before** tryFile via PathRuleFamily `resource-query-strip` on the **js-ts**
family (`.astro` resolve family is also `js-ts`). Python early-returns without
this step. Candidates (PHP/C/…) must not inherit query strip blindly — see
`CANDIDATE_LANGUAGE_NOTES` in `resolveRules.ts`.

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
