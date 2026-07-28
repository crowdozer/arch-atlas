# Cycle scan cheatsheet (circular import chains)

**Status:** current implementation (P1 graph interpretation + mermaid honesty).  
**Question this answers:** “Does this repo have circular import chains, and where?”

Honesty: Level-1 static import graph (Tarjan **SCC**, size ≥ 2). **Not** LSP,
type-aware resolve, bundler tree-shake, runtime module-init cycles, or
rename-aware. Treat as **evidence**, not product law.

Same analyzer for both lenses: `src/core/catalog/cycles.ts` over `CodeGraph`
file→file edges. Lenses differ in **shape** and **caps**, not in algorithm.

## Which command?

| Goal | Prefer | Why |
| ---- | ------ | --- |
| **Enumerate** circular chains (machine-readable) | `digest` → `catalog.cycles` | Structured `{ runtime, type }` SCC rows: `size`, `edgeCount`, `samplePaths` |
| **Glance** structure + cycle honesty for chat/docs | `mermaid` (dependency mode, default) | `flowchart LR` + `%% cycles.runtime (file SCC)` comments + multi-prefix SCC subgraphs |
| Folder/file containment sketch only | `mermaid --containment` | `flowchart TB` indexed hierarchy; **no** import edges or SCC comments (default **summary** presentation; not a cycle glance) |
| Neighborhood of one path in a knot | `file --file <rel>` | Imports / importers around a sample path |
| Cycle **change** between two refs | `impact` | Topology delta only — **no** dedicated SCC-delta field today; infer from edge movers / degree |

**Anti-pattern:** “Run mermaid only and treat the diagram as the full cycle
audit.” Dependency mermaid grain is **topFolder** rollup; within-folder file
cycles **collapse to one node** and live only in header comments (sample paths).
**`--containment` is not cycle honesty** — summary or full folder tree only;
use default dependency mermaid (or `digest` SCCs) for cycles.

## Recipes

```bash
ROOT="${ARCH_ATLAS_ROOT:-$HOME/git-personal/arch-atlas}"
TARGET="/path/to/product/repo"   # e.g. ~/git-personal/sentinel
OUT="${TMPDIR:-/tmp}/atlas-cycles-$$"

# 1) Enumerate SCCs (prefer --estimate for topology-only; mass is irrelevant)
(cd "$ROOT" && npm run atlas -- digest "$TARGET" \
  --estimate \
  --omit node_modules --omit dist --omit fixtures \
  --out "$OUT-digest.json")

# Product-ish feed (drops test/debug/scripts path heuristics)
(cd "$ROOT" && npm run atlas -- digest "$TARGET" \
  --scope product --estimate \
  --omit node_modules --omit dist \
  --out "$OUT-product.json")

# 2) Structure sketch + cycle honesty comments
(cd "$ROOT" && npm run atlas -- mermaid "$TARGET" \
  --omit node_modules --omit dist --omit fixtures \
  --limit 40 \
  --out "$OUT-structure.mmd")

# 3) Drill one sample path from an SCC
(cd "$ROOT" && npm run atlas -- file "$TARGET" \
  --file src/core/store/index.ts \
  --out "$OUT-file.json")
```

Always use **`--out`**. Do not paste full digest JSON into chat.

### Quick extract (digest)

```bash
# jq: runtime SCCs only
jq '.catalog.cycles.runtime[] | {size, edgeCount, samplePaths}' "$OUT-digest.json"
```

### Quick extract (mermaid)

Open the `.mmd` and read the **header comments first** (before `subgraph` / nodes):

```text
%% cycles.runtime (file SCC): size=N sample=a.ts, b.ts, …; size=M sample=…
%% cycles.runtime (prefix SCC): size=2 sample=src/core, src/satellite
%% note: within-prefix file cycles are listed above; they collapse under one topFolder node
```

Then the diagram: multi-prefix SCCs as `subgraph sccN["SCC · size N"]`; size-2
mutual folder pairs may use `<-->` with combined edge counts.

## Read order

### Digest (`catalog.cycles`)

1. **`summary`** — `sourceCount` / `edgeCount` / languages (empty graph = non-signal).
2. **`catalog.cycles.runtime`** — value-import SCCs (usually what “circular
   imports” means for load/order pain).
3. **`catalog.cycles.type`** — `import type` / `export type … from` only
   (best-effort; may be empty when type edges are sparse or misclassified).
4. Per row: **`size`** (member files) → **`edgeCount`** (edges inside the
   component) → **`samplePaths`** (up to **8** members; full member set is
   not always listed).
5. **`warnings`** — omit hits, “Many files”, feed notes.

Then write **5–10 lines** of signal (largest SCCs, which subsystems, whether
type-only). Cite sample paths; do not dump the array.

### Mermaid

1. Header **`%% cycles.runtime (file SCC)`** — file-level knots (including
   within one topFolder).
2. Header **`%% cycles.runtime (prefix SCC)`** — multi-folder mutual reachability
   among kept prefixes.
3. Diagram subgraphs / `<-->` — same multi-prefix story, visual.
4. Truncation line if present: `%% truncated: kept K of N prefixes (limit=…)`.

## Caps & honesty (do not overclaim)

| Cap / fact | Reality |
| ---------- | ------- |
| SCC definition | Mutual reachability on file→file edges (Tarjan); size ≥ 2 only |
| Runtime vs type | Runtime: `!typeOnly`. Type: `typeOnly` only. Ranking elsewhere also prefers runtime |
| `samplePaths` | Max **8** paths per SCC row — large components are sampled, not fully listed |
| Digest `--limit` | Caps how many SCCs appear per partition (default **40**), ranked by size then edgeCount |
| Mermaid `--limit` | Dependency: caps **prefix nodes** (default **40**); SCC-related prefixes force-include when possible. Containment: max expanded leaves (summary) or balanced max file leaves (full) — no SCC effect |
| Mermaid file SCC list | Dependency mode only: from catalog when present; else `catalogCycles(graph, max(limit, 15))` |
| Mermaid grain | Dependency: **topFolder** path-prefix; same-prefix self-loops omitted from edges. Containment: indexed paths only (`presentation=summary\|full`) |
| Within-prefix cycles | Dependency: visible in **comments** only, not as multi-node diagram SCCs. Containment: not reported |
| `mermaid --containment` | Hierarchy only; default summary (tree-like); **not** a substitute for cycle honesty or `digest` SCCs |
| `typeOnly` classification | Best-effort (`import { type X }` may still look like value form) |
| Exact / Program | **Irrelevant** to cycle topology; mermaid is always L1 Estimate topology |

## Interpretation guardrails

| Trap | Reality |
| ---- | ------- |
| SCC = always a bug | Not always. Shared barrels, store facades, or intentional mutual modules can SCC without runtime death |
| Folder `<-->` = one file cycle | Folder mutual can be many cross-edges; drill with `file` / sample paths |
| Empty `type` SCCs | Common; does not prove no type cycles if edges were classified as value |
| Huge monorepo / data trees | Use `--omit` / `--scope product` or the graph noise dominates |
| Merge gate | Cycles are **supplemental** evidence; not a sole ship/block rule |

## Workflow hooks

| Role / phase | When | What |
| ------------ | ---- | ---- |
| **`/research`**, ship research | “Circular imports?”, knot claims, layer violations | `digest` cycles (+ optional `mermaid` sketch); 5–10 lines |
| **`/docu`** | Documenting ownership / “acyclic layers” claims | Reconcile prose with `catalog.cycles` before locking |
| **`/czar`** | Branch introduces new mutual deps | Prefer `impact` for edge delta; optional digest cycles on head if review is cycle-focused |
| **`/engineer`** | Awareness | Plan owns architecture; optional post-fix re-digest |

Global soft-fail contract:
`~/git-personal/dotfiles/grok/skills/_shared/arch-atlas.md`.

## Related

- CLI: `src/cli/main.ts` (`digest` / `mermaid` / `file`)
- Core: `src/core/catalog/cycles.ts`, `src/core/export/agentMermaid.ts`,
  `src/core/export/agentDigest.ts`
- Catalog idea: [mermaid-structure-graph](../catalog/entries/mermaid-structure-graph.md)
- [analysis-honesty.md](./analysis-honesty.md) — Estimate / Exact ladder
- [impact-cheatsheet.md](./impact-cheatsheet.md) — two-ref topology delta
- [analysis-protocol.md](./analysis-protocol.md) — P1 graph interpretation
