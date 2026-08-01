# Git commit contract - Arch Atlas scopes overlay

Global format, body template, and bot identities live in
`~/git-personal/dotfiles/grok/skills/_shared/git-commits.md`.
This file is the **repo overlay**: scopes and examples for Arch Atlas.

All role commits in this repo must follow this format.

## Subject line

```
<type>(<scope>): <summary>
```

Imperative mood, ≤ 72 characters, no trailing period.

### Allowed types

| Type       | Typical role                     |
| ---------- | -------------------------------- |
| `feat`     | engineer                         |
| `fix`      | engineer                         |
| `refactor` | engineer                         |
| `perf`     | engineer                         |
| `test`     | engineer, czar                   |
| `docs`     | docs                             |
| `chore`    | czar (merge/conflict resolution) |

### Scopes

| Scope        | Use for                                           |
| ------------ | ------------------------------------------------- |
| `graph`      | Normalized CodeGraph, nodes/edges, store          |
| `parse`      | Language parsers, Tree-sitter, ZIP ingest         |
| `adapter`    | Framework adapters (detect/classify/enrich/views) |
| `view`       | Projections, map catalog, alluvial stages/weights |
| `ui`         | Pages, components, Carbon shell, design language  |
| `core`       | Shared pure modules not covered above             |
| `docs`       | README, AGENTS, `.grok/**` skills and reference   |
| `ci`         | Test runner config, CI scripts                    |
| `deps`       | Dependency updates                                |
| `arch-atlas` | Cross-cutting changes that span multiple layers   |

## Body (required)

```
Intent: <why this change exists>

Design contract preserved: <invariants kept - local-first, epistemic layers,
graph-as-SoR, suggested views, etc.>

Tests: <commands run and pass/fail; "none" only for docs-only with justification>

AI notes: Role=<czar|engineer|docs>; skill=/<role>
```

## Git identities

Inline identity on each commit (do not `git config` name/email). All bot emails use
Gmail plus-addressing: `crwdzr+<bot>@gmail.com` (no hyphen in the local part).

```bash
git -c user.name="<name>" -c user.email="<email>" commit -m "..."
```

| Role     | `user.name`    | `user.email`                   |
| -------- | -------------- | ------------------------------ |
| czar     | `czar-bot`     | `crwdzr+czarbot@gmail.com`     |
| engineer | `engineer-bot` | `crwdzr+engineerbot@gmail.com` |
| docs     | `docs-bot`     | `crwdzr+docsbot@gmail.com`     |

Research does not commit.

## Pre-commit checklist

1. Run the smallest sufficient suite (`npm run build` / typecheck / tests when present).
2. Confirm diff matches role scope (engineer: code; docs: docs only; czar: test/chore only).
3. Body includes all four sections.

## Examples

```
docs(docs): scaffold product overlay

Intent: Land AGENTS, preamble, scope, and commit scopes for greenfield work.

Design contract preserved: N/A (docs only).

Tests: none (markdown only)

AI notes: Role=docs; skill=/docu
```

```
feat(graph): add Level-1 file and import nodes

Intent: Persist static import edges so API and category projections share one SoR.

Design contract preserved: observed edges only; no inferred categories yet.

Tests: npm run build

AI notes: Role=engineer; skill=/engineer
```
