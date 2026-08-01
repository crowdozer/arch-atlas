# `.grok/ships` - frontier / ship audit memory

**Architectural queue memory**, not operational process state.

Full contract: global
`~/git-personal/dotfiles/grok/skills/_shared/frontier-review.md`.

| Lives here (git)                               | Does **not** live here                  |
| ---------------------------------------------- | --------------------------------------- |
| `frontier-review.md` + thin `meta.json` per id | Feature worktrees (`wt/`)               |
| Pending / done / skipped review markers        | Full `/ship` `run_dir`, events, patches |
| Thin ship audit identity (branch, subject)     | Absolute-path resume `state.json`       |

## Layout

```text
.grok/ships/
  README.md
  <id>/
    frontier-review.md
    meta.json
```

## Contract

- Producers: `/ship --heavy` (unless `--no-review`), `/docu --review`
- Operational resume: `$XDG_STATE_HOME/grok/ship-<RUN_ID>/` only
- Never commit `wt/`, `merge-wt/`, `events/`, or node_modules under this tree

## Status

`meta.json` `status`: `pending` | `done` | `skipped`.
