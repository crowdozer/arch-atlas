# Language landing checklist (L1)

Ship bar for admitting a new Estimate language family. Companion:
[multilang-roadmap.md](./multilang-roadmap.md),
[analysis-protocol.md](./analysis-protocol.md) (L1 = syntax-level observed edges).

**Do not** treat hub demos or product fixtures as L1 source of truth. Use
`fixtures/golden-l1-<id>/` + extract unit FP suites.

## Checklist

- [ ] Admit ext + `classifyFileParse` / greying (`capability.ts`)
- [ ] Extract positives (forms table: import / from / relative / bare / …)
- [ ] **Extract false-positive suite** — comments/strings/template lookalikes
      must **not** edge; **real edge coexists in the same source**
      (`describe('L1 false-positive guards')` in the language's extract test)
- [ ] Resolve family in `RULES_BY_FAMILY` + `familyForPath` (`resolveRules.ts`)
- [ ] **Specifier normalize policy** documented (or explicitly N/A)
      - js-ts: `resource-query-strip` (`?worker` / `?raw` / `#hash`) — **not universal**
      - python: early-return; no bundler query strip
- [ ] `CANDIDATE_LANGUAGE_NOTES` updated (transfer blockers, not runtime plugins)
- [ ] `fixtures/golden-l1-<id>/` minimal tree + `goldenL1.integration.test.ts`
      (or equivalent) edge assertions — product-agnostic, no UI domain
- [ ] Honesty non-claims listed (dynamics, site-packages, template HTML, Exact, …)
- [ ] Exact story (missing engine vs later)

## Dual stamps (Astro pattern)

| Stamp | Meaning |
| ----- | ------- |
| `parseKind` | Extract adapter (`astro-import`, `python-import`, `js-ts-import`) |
| resolve `familyForPath` | Path rules family (`js-ts` for `.astro`; `python` for `.py`) |

Intentional: Astro extract is an island adapter; path resolve reuses js-ts
(including `resource-query-strip`).

## Debugging discipline

**When External / graph topology looks wrong → inspect L1 extract edges for
that language first** (string/comment false positives, missing specifier
normalize, wrong resolve family) before hub polish, catalog ranking, or Exact.

## Minimal goldens (admitted)

| Fixture | Laws covered |
| ------- | ------------ |
| `fixtures/golden-l1-js-ts/` | relative, package, `@/*` alias, `?worker` file, adversarial no `\|` |
| `fixtures/golden-l1-python/` | relative, absolute package, bare external, adversarial # / `"""` |
| `fixtures/golden-l1-astro/` | frontmatter + script islands; HTML lookalikes not edges |

Demos (`demo-*`), `codebreaker-focus`, and hub orientation goldens remain
**product/UI/hub** contracts — not L1 minimize targets.
