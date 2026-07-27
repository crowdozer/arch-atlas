# Analysis honesty ladder

Product-facing contract for **what each precision tier means**. Companion catalog:
[analysis-capability-honesty](../catalog/entries/analysis-capability-honesty.md).

UI and docs must not claim full **LSP**, **LanguageService**, or **bundler
tree-shake** for the current in-tab Exact path.

## One-sentence contracts

| Tier | Contract |
| ---- | -------- |
| **Estimate** | Observed static JS/TS import graph + estimate mass (fuzzy by design). |
| **Exact (web)** | Export-declaration surface for JS/TS bindings via classic TS AST (`createSourceFile`) or text fallback — **not** a language server. |
| **VS Code host (future)** | Same `ImportedSurfaceProvider` port; host may use workspace language features / multi-LSP — still not automatic tree-shake. |

## Capability scorecard

### Estimate (Level-1)

| | |
| - | - |
| **Shows** | File/package nodes; static import/require/export edges; estimate band weights (edges, importer LOC, target whole-file LOC; reverse hub uses importer LOC under Imported LOC). |
| **Gets right** | Observed topology; no type fantasy; local-first. |
| **Misrepresents if…** | User expects resolved monorepo paths, dynamic imports, or multi-lang edges. |
| **Missing** | Symbols, calls, type-aware resolve, non-JS/TS import parse. |

### Exact (in-tab “export surface”)

| | |
| - | - |
| **Shows** | Same graph; band mass from **matched export spans**; inspect imported code = those spans; callsites = word-boundary name scan in importer. |
| **Gets right** | Named/default import drops unused sibling exports; fail-closed without provider; side-effect does not dump whole module. |
| **Close** | “Shaken” label ≈ export surface, not bundler shake; “Program” notes ≈ per-file AST. |
| **Misrepresents if…** | Labeled **LSP** / full typecheck / true tree-shake; package mass “1” read as real package size; unresolved forward mass “1” read as tiny real surface. |
| **Missing** | `createProgram` project, re-export follow, usage-based trim, type-only honesty, multi-lang engines, graph re-index. |

### VS Code extension (not landed as Exact backend)

| | |
| - | - |
| **Buys** | Workspace FS; extension-host heap; inject `ImportedSurfaceProvider`; access to installed language features (TS + other LSPs). |
| **Does not buy alone** | Automatic full multi-lang Exact product; **bundler tree-shake**; zero work on surface policy. |
| **Honest goal** | Better resolution/references/Program for JS/TS; multi-lang later via same port. |

## Map catalog bins (mass + spines)

Catalog ranking bins that touch size or “importance” must stay on the honesty
ladder. Exact **does not re-index** topology; mass overlays only reweight from
export-surface LOC when a surface map is available.

| Bin | Tier | What it measures | Honesty |
| --- | ---- | ---------------- | ------- |
| **File LOC** | Estimate (always) | Whole-file line count of indexed source | Baseline “big files.” **Not** replaced by Exact on the web map catalog. |
| **Public mass** | Exact overlay only | Large files where `surfaceLoc / wholeLoc` is high (defaults: whole ≥ 80, ratio ≥ 0.90); ranked by surface LOC | Export-declaration surface ratio — **not** LSP, **not** bundler tree-shake. Empty under Estimate. |
| **Icebergs** | Exact overlay only | Large files with substantial private body under a smaller surface (defaults: whole ≥ 80, ratio ≤ 0.70, private ≥ 40); ranked by private LOC | Same surface map honesty as public mass. Empty under Estimate. |
| **Spines** | Estimate topology | Cross-cutting dependency-plane files: direct fan-in + importer module diversity (`topFolder`); optional formula chooser | Observed import graph + path folders. Not a basename/config classifier; not multi-hop blast alone; not LSP. |

**File LOC stays whole-file** on the map catalog and in estimate digests. Agent
digest `--exact` may **re-rank** `catalog.fileLoc` by export-surface LOC for
comparison while retaining whole-file rows in `catalogEstimateFileLoc` — that
is a digest lens, not a claim that UI File LOC became surface mass.

**Public mass / icebergs** use the Exact export-surface ratio only
(`buildMassBins` + surface map). UI needs Exact ready (provider + precision);
CLI needs `--exact` / `--exact-local`. Empty arrays under estimate keep a stable
catalog shape.

**Spines** are ranked from estimate-graph topology (`spineMetrics` /
`rankSpineRows`). Formula options: `modules-then-in` (default), `fan-in`,
`composite`, `share`. Soft floor: `importerModuleCount ≥ 2` except pure
`fan-in`. Formula help lives in the Spines accordion (not a separate honesty
tier).

## UI copy rules

1. Prefer **export surface** / **Exact (export surface)** over **LSP**.
2. Prefer **Imported LOC (export surface)** over bare **Shaken** when space allows; tooltip must say export decls, not bundler.
3. Inspect headers: **estimate** vs **export surface** (not “exact LSP”).
4. Callsites: always qualify **not type-checked** / **name scan**.
5. Status: **export-surface mode** + engine source (`local` / `cdn` / `inject`).
6. Mixed-language: keep warning that only JS/TS Exact applies.
7. Catalog: **File LOC** = whole-file; **Public mass** / **Icebergs** = need Exact (export surface); **Spines** = topology + formula (not mass Exact).

## Related

- [scope.md](./scope.md) — product contracts  
- [hub-alluvial-behavior.md](./hub-alluvial-behavior.md) — reverse mass dual-side  
- Catalog futures: [exact-surface-mode-futures](../catalog/entries/exact-surface-mode-futures.md)  
