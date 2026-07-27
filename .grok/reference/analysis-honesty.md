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

## UI copy rules

1. Prefer **export surface** / **Exact (export surface)** over **LSP**.
2. Prefer **Imported LOC (export surface)** over bare **Shaken** when space allows; tooltip must say export decls, not bundler.
3. Inspect headers: **estimate** vs **export surface** (not “exact LSP”).
4. Callsites: always qualify **not type-checked** / **name scan**.
5. Status: **export-surface mode** + engine source (`local` / `cdn` / `inject`).
6. Mixed-language: keep warning that only JS/TS Exact applies.

## Related

- [scope.md](./scope.md) — product contracts  
- [hub-alluvial-behavior.md](./hub-alluvial-behavior.md) — reverse mass dual-side  
- Catalog futures: [exact-surface-mode-futures](../catalog/entries/exact-surface-mode-futures.md)  
