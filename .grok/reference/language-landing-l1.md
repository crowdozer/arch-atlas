# Language landing checklist (L1)

Ship bar for admitting a new Estimate language family. Companion:
[multilang-roadmap.md](./multilang-roadmap.md),
[analysis-protocol.md](./analysis-protocol.md) (L1 = syntax-level observed edges).

**Do not** treat hub demos or product fixtures as L1 source of truth. Use
`fixtures/golden-l1-<id>/` + extract unit FP suites.

## Checklist

- [ ] Admit ext + `classifyFileParse` / greying (`capability.ts`)
- [ ] Extract positives (forms table: import / from / relative / bare / …)
- [ ] **Extract false-positive suite** - comments/strings/template lookalikes
      must **not** edge; **real edge coexists in the same source**
      (`describe('L1 false-positive guards')` in the language's extract test)
- [ ] Resolve family in `RULES_BY_FAMILY` + `familyForPath` (`resolveRules.ts`)
- [ ] **Specifier normalize policy** documented (or explicitly N/A) - js-ts: `resource-query-strip` (`?worker` / `?raw` / `#hash`) - **not universal** - python: early-return; no bundler query strip
- [ ] `CANDIDATE_LANGUAGE_NOTES` updated (transfer blockers, not runtime plugins)
- [ ] `fixtures/golden-l1-<id>/` minimal tree + `goldenL1.integration.test.ts`
      (or equivalent) edge assertions - product-agnostic, no UI domain
- [ ] Honesty non-claims listed (dynamics, site-packages, template HTML, Exact, …)
- [ ] Exact story (missing engine vs later)
- [ ] **Adversarial L1 bar** (see below) - garbage-specifier invariant + FP class matrix row for the new language

## Adversarial L1 bar (ship add-on)

Third belt after extract FP units and `fixtures/golden-l1-*` disk goldens:

| Layer                     | Home                              | Asserts                                                                                                                                                                                  |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garbage-specifier grammar | `src/core/parse/l1GarbageSpec.ts` | Package names + non-path-like unresolved are not extract soup (`\|`, `kind:`, empty, `?`/`#` on package id). **Test invariant only** - not a production filter in `buildGraph` / resolve |
| Fixtures corpus           | `l1Adversarial.corpus.test.ts`    | Every top-level `fixtures/*` project → `buildGraph` → zero garbage externals (demos are corpus inputs, not L1 minimize SoT)                                                              |
| FP class matrix           | `l1FpClassMatrix.test.ts`         | Cross-lang table (`keyword-in-string` / comment / template / tooling-suffix / form-arg soup / …): each admitted language **implements** or marks **N/A** with an active assertion        |
| Light lex soup            | same matrix file                  | Deterministic comment/string wrappers around `import` lookalikes → empty harvest + real edge kept (no fast-check)                                                                        |

**When adding a language:** extend the matrix column (implements | N/A + run), add `golden-l1-<id>/` if applicable, keep corpus green without weakening `l1GarbageSpec` to green-wash real FPs - fix extract/resolve instead.

## Dual stamps (Astro pattern)

| Stamp                   | Meaning                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `parseKind`             | Extract adapter (`astro-import`, `python-import`, `js-ts-import`) |
| resolve `familyForPath` | Path rules family (`js-ts` for `.astro`; `python` for `.py`)      |

Intentional: Astro extract is an island adapter; path resolve reuses js-ts
(including `resource-query-strip`).

## Debugging discipline

**When External / graph topology looks wrong → inspect L1 extract edges for
that language first** (string/comment false positives, missing specifier
normalize, wrong resolve family) before hub polish, catalog ranking, or Exact.

## Minimal goldens (admitted)

| Fixture                      | Laws covered                                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| `fixtures/golden-l1-js-ts/`  | relative, package, `@/*` alias, `?worker` file, adversarial no `\|` |
| `fixtures/golden-l1-python/` | relative, absolute package, bare external, adversarial # / `"""`    |
| `fixtures/golden-l1-astro/`  | frontmatter + script islands; HTML lookalikes not edges             |

Demos (`demo-*`), `codebreaker-focus`, and hub orientation goldens remain
**product/UI/hub** contracts - not L1 minimize targets.

**Test ownership:** pure L1 edge laws → `goldenL1.integration.test.ts` +
`fixtures/golden-l1-*`; adversarial post-graph belt → `l1GarbageSpec` +
`l1Adversarial.corpus` + `l1FpClassMatrix`; `build.test.ts` samples =
app/catalog smoke; codebreaker = product alias domain.
