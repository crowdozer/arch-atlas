# Impact CLI cheatsheet (agent-impact.v1)

**Experiment:** Level-1 **import-topology impact** between two git refs.
Not Evolution UI, not co-change, not line-age, not Exact mass deltas.

Schema: `arch-atlas.agent-impact.v1`  
Honesty: static JS/TS import graph **topology delta** - not LSP / not tree-shake /
not co-change / not rename-aware.

## Command recipes

```bash
# Branch vs base (ship research / czar)
npm run atlas -- impact . \
  --base main \
  --head HEAD \
  --omit fixtures \
  --out "${TMPDIR:-/tmp}/atlas-impact.json"

# Single commit
npm run atlas -- impact . \
  --base HEAD^ \
  --head HEAD \
  --omit fixtures \
  --out /tmp/impact.json
```

| Flag                | Notes                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `--base` / `--head` | **Required** git refs (branch, tag, SHA, `HEAD^`, …)                  |
| `--omit`            | Same both sides (use `fixtures` for product self-scan)                |
| `--limit N`         | Caps movers + edge **samples** (default 40). Counts stay full.        |
| `--out`             | Write JSON to file (prefer this; avoid dumping huge stdout into chat) |
| `--exact`           | **Ignored** with a warning (topology-only experiment)                 |

Exit codes: **0** success (including empty delta); **1** usage / git / IO / index.
Never fails solely because topology changed a lot.

Materialization: `git archive --format=zip <ref>` → temp ZIP → same omit/depth
filters as digest. Dirty working tree is **not** included.

## Read order (large JSON)

Do **not** paste the full JSON into agent context. Open the file and read in this order:

1. **`summary`** - `base` / `head` / `delta` for `sourceCount`, `edgeCount`,
   `packageCount`, `unresolvedCount`. Cheap global shape.
2. **`files` / `packages`** - `added` / `removed` path and package-id lists
   (source paths only for files).
3. **`edges.addedCount` / `edges.removedCount`** - magnitudes first.
4. **`edges.added` / `edges.removed` samples** - structural edges only
   (`from`, `to`, `toKind`, `form`, `line`). Equality key **omits** `line`
   (`from\0to\0toKind\0form`); line is still emitted when available for human reading.
5. **`blastMovers`** - top-N by \|Δ reverseReachFiles\| (full reverse metrics both
   sides, **not** only catalog top-15 lists). Gravity / consumer-reach shifts.
6. **`degreeMovers`** - top-N by max(\|Δin\|, \|Δout\|).
7. **`warnings`** - materialization notes, empty graphs, sample caps, exact ignored.

Then write **5–10 lines** of architectural signal into research.md / review notes
(not the raw JSON).

## Interpretation guardrails

| Trap                   | Reality                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| More edges = bad       | Not always. Role matters (composition root vs godfile).                            |
| Rename                 | Looks like delete+add of path + edges. No rename intelligence in MVP.              |
| Empty delta            | Common for docs-only or non-JS changes. Still exit 0.                              |
| Line-only edits        | Same edge key if only `line` moved → **not** counted as remove+add.                |
| Multi-import same pair | Collapsed to set presence (one key per side).                                      |
| Merge gate             | Impact is **supplemental**. Does not replace tests, diff review, or czar judgment. |

## Workflow hooks (global role pack)

Global Grok skills (`~/git-personal/dotfiles/grok/skills/`, especially
`_shared/arch-atlas.md`) **do** call this CLI when available. Soft-fail if the
arch-atlas checkout or `npm run atlas` is missing - agents continue with
path/grep/`git` evidence.

| Role / phase                 | When                                                | Command shape                                                                     |
| ---------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Ship research**            | Architecture-heavy tasks                            | `digest` and/or `impact` base..head; **Atlas lens** (5–10 lines) in `research.md` |
| **Ship plan**                | Research ran atlas, or reconstructive / multi-owner | **Atlas consulted** section                                                       |
| **`/research`**, **`/docu`** | Structural claims (hubs, roots, blast/spines)       | `digest` / `file` (+ `impact` if two refs matter)                                 |
| **`/engineer`**              | Awareness only                                      | Not primary toolkit; plan owns architecture                                       |
| **`/czar`**                  | Architecture-affecting review                       | `impact --base <base> --head <branch>` after git stats; **supplemental** only     |

**Still true:** impact is not a sole merge gate; never paste full JSON; Estimate
honesty (not LSP / tree-shake / co-change / rename-aware).

**Confirmable CLI bugs** (reproducible command + expected vs actual topology):
file with `/catalog` in **this** repo so product fixes can land - do not only
soft-fail forever in the calling project.

## Related

- Global agent contract: `~/git-personal/dotfiles/grok/skills/_shared/arch-atlas.md`
- [analysis-honesty.md](analysis-honesty.md) - Estimate / Exact / VS Code ladder
- [cycles-cheatsheet.md](cycles-cheatsheet.md) - circular import SCCs (`digest` / `mermaid`); no dedicated SCC-delta in impact MVP
- Catalog: `git-architectural-time-machine` - Evolution vision; this CLI is a thin
  two-ref topology slice, not full time-machine
- CLI implementation: `src/cli/main.ts` (`impact`), pure core: `src/core/export/agentImpact.ts`
