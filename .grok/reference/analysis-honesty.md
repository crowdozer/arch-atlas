# Analysis honesty ladder

Product-facing contract for **what each precision tier means** **today**.

**Canonical multi-host direction (L0–L4, Program, phases):**
[analysis-protocol.md](./analysis-protocol.md) · catalog
[analysis-protocol-multi-host](../catalog/entries/analysis-protocol-multi-host.md).

Companion catalog (Estimate / Exact scorecard detail):
[analysis-capability-honesty](../catalog/entries/analysis-capability-honesty.md).

UI and docs must not claim full **LSP**, **LanguageService**, or **bundler
tree-shake** for the current in-tab Exact path. Never market L1 syntax as L3
semantic analysis (see capability ladder in analysis-protocol).

## One-sentence contracts

| Tier                          | Contract                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estimate**                  | Observed static import graph for **JS/TS + Python + Astro script islands (L1)** + estimate mass (fuzzy by design). Other admitted sources may show grey (“present, not parsed”).                                                                                                                                |
| **Exact (web)**               | Export-declaration surface for **JS/TS** bindings via classic TS AST (`createSourceFile`) or text fallback - **not** a language server. Python and Astro stay estimate mass (no island Exact surface yet). Web remains estimate-first / opt-in.                                                                 |
| **Exact (CLI digest)**        | Same export-surface overlay as web. **`digest` defaults Exact-on** (soft-fallback → estimate + warning on engine miss). `--estimate` opts out; `--exact` / `--exact-local` are fail-closed. Tree/file/impact stay topology-only.                                                                                |
| **Program (CLI `--program`)** | CLI `--program` or browser Precision **Program** (Web Worker): TypeScript `createProgram` over feed VFS - may re-resolve in-feed modules and attach thin `exportSymbolCount`. Soft-fail keeps L1 graph. Evidence-gated L2/L3 stamps. **Not** LSP / not full monorepo. Distinct from Exact export-surface spans. |
| **VS Code host (future)**     | Same `ImportedSurfaceProvider` port; host may use workspace language features / multi-LSP - still not automatic tree-shake.                                                                                                                                                                                     |

## Capability scorecard

### Estimate (Level-1)

|                       |                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shows**             | File/package nodes; static import/require/export edges (JS/TS + Python `import`/`from` + Astro frontmatter/`<script>` islands); estimate band weights (edges, importer LOC, target whole-file LOC; reverse hub uses importer LOC under Imported LOC). |
| **Gets right**        | Observed topology; no type fantasy; local-first; Python package-relative + bare external leaves; Astro component/script imports only (not template HTML graph).                                                                                       |
| **Misrepresents if…** | User expects resolved monorepo paths, dynamic imports, site-packages, or full multi-lang Exact.                                                                                                                                                       |
| **Missing**           | Symbols, calls, type-aware resolve; C/PHP/Lua extractors; Python Exact / pyright; Astro Exact island surface.                                                                                                                                         |

### Exact (export surface - web + CLI digest)

|                                    |                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shows**                          | Same graph; band / catalog mass from **matched export spans**; inspect imported code = those spans; callsites = word-boundary name scan in importer. Agent digest: re-ranked `fileLoc` + `publicMass` / `icebergs` when Exact applied.                                                         |
| **Gets right**                     | Named/default import drops unused sibling exports; fail-closed without provider (web always; CLI when `--exact` / `--exact-local`); side-effect does not dump whole module. CLI default Exact soft-falls back to estimate.                                                                     |
| **Close**                          | “Shaken” label ≈ export surface, not bundler shake; “Program” notes ≈ per-file AST.                                                                                                                                                                                                            |
| **Misrepresents if…**              | Labeled **LSP** / full typecheck / true tree-shake; package mass “1” read as real package size; unresolved forward mass “1” read as tiny real surface; **`surfaceLoc` read as public-API member surface** (it is export-declaration **span** coverage only).                                   |
| **Missing (export-surface Exact)** | Re-export follow, usage-based trim, full `import { type X }` classification, multi-lang engines. **Graph re-index is not Exact** - use CLI **`--program`** (`createProgram` over feed VFS) for opt-in L2 re-resolve + thin L3 `exportSymbolCount` (soft-fail, evidence-gated stamps; not LSP). |

### VS Code extension (not landed as Exact backend)

|                        |                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Buys**               | Workspace FS; extension-host heap; inject `ImportedSurfaceProvider`; access to installed language features (TS + other LSPs). |
| **Does not buy alone** | Automatic full multi-lang Exact product; **bundler tree-shake**; zero work on surface policy.                                 |
| **Honest goal**        | Better resolution/references/Program for JS/TS; multi-lang later via same port.                                               |

## Map catalog bins (mass + spines)

Catalog ranking bins that touch size or “importance” must stay on the honesty
ladder. Exact **does not re-index** topology; mass overlays only reweight from
export-surface LOC when a surface map is available.

| Bin             | Tier               | What it measures                                                                                                                                                     | Honesty                                                                                                                                                                                       |
| --------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File LOC**    | Estimate (always)  | Whole-file line count of indexed source                                                                                                                              | Baseline “big files.” **Not** replaced by Exact on the web map catalog.                                                                                                                       |
| **Public mass** | Exact overlay only | Large files where `surfaceLoc / wholeLoc` is high (defaults: whole ≥ 80, ratio ≥ 0.90); ranked by surface LOC                                                        | Export-declaration **span** ratio - **not** public-API member surface, **not** LSP, **not** bundler tree-shake. Empty under Estimate. JS/TS (`js-ts-import`) only; debug/scripts paths gated. |
| **Icebergs**    | Exact overlay only | Large files with substantial private body under a smaller surface (defaults: whole ≥ 80, ratio ≤ 0.70, private ≥ 40); ranked by private LOC; skip `surfaceLoc === 0` | Same surface map honesty as public mass. Empty under Estimate.                                                                                                                                |
| **Spines**      | Estimate topology  | Cross-cutting dependency-plane files: direct fan-in + importer module diversity (`topFolder`); optional formula chooser                                              | Observed import graph + path folders. Not a basename/config classifier; not multi-hop blast alone; not LSP.                                                                                   |

**File LOC stays whole-file** on the map catalog and in estimate digests. Agent
digest with Exact applied (CLI **default**, or explicit `--exact` /
`--exact-local`) may **re-rank** `catalog.fileLoc` by export-surface LOC for
comparison while retaining whole-file rows in `catalogEstimateFileLoc` - that
is a digest lens, not a claim that UI File LOC became surface mass.

**Public mass / icebergs** use the Exact export-surface ratio only
(`buildMassBins` + surface map). UI needs Exact ready (provider + precision);
CLI digest applies Exact by default (soft-fallback) or fail-closed when
`--exact` / `--exact-local` is explicit; `--estimate` forces empty mass bins.
Empty arrays under estimate keep a stable catalog shape.

**Spines** are ranked from estimate-graph topology (`spineMetrics` /
`rankSpineRows`). Formula options: `modules-then-in` (default), `fan-in`,
`composite`, `share`. Soft floor: `importerModuleCount ≥ 2` except pure
`fan-in`. Formula help lives in the Spines accordion (not a separate honesty
tier).

## Agent CLI ranking honesty

Agent JSON is a lens over the same Level-1 graph. Prefer these stamps over
re-deriving meaning from bare counts:

| Signal                                                          | Honesty                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`scope`**                                                     | `omit`, `includeTests`, `exactRequested` / `exactApplied`, `feedKind` - what the host actually fed and whether Exact mass applied.                                                                                                                                                                                              |
| **`surfaceLoc` / `exportDeclarationLoc` / `surfaceMetricNote`** | Export-declaration **span coverage**, not public-API surface area. Wire keeps `surfaceLoc`; dual-publish `exportDeclarationLoc`. Mass rows may include `surfaceSupport`.                                                                                                                                                        |
| **`downwindReach` / `reverseReach`**                            | Agent aliases of catalog `complex` / `blastRadius`.                                                                                                                                                                                                                                                                             |
| **File `analysis.fileLens`**                                    | Capability matrix: mass false on file command; neighbors + catalogHits topology-only.                                                                                                                                                                                                                                           |
| **`unresolvedReason` / cycles / boundary**                      | Taxonomy + SCC + boundary crossings are graph **interpretation** (observed edges; roles/boundary inferred). Not Program L2. **Cycle scan recipe:** [cycles-cheatsheet.md](./cycles-cheatsheet.md) - prefer `catalog.cycles` for enumeration; mermaid for structure + `%%` honesty (within-prefix SCCs collapse in the diagram). |
| **`toKind: 'omitted'`**                                         | Target missing because feed `--omit`, **not** true unresolved. Ends ranking should not treat omitted as architecture ends the same as unresolved.                                                                                                                                                                               |
| **`typeOnly` edges**                                            | From `import type` / `export type … from`. Ranking (hotspots / complex / blast degrees) prefers **runtime** edges when the flag is present. Best-effort: `import { type X }` may still be classified as value form. Full graph retains both.                                                                                    |
| **`rankScore` (hotspots)**                                      | Sort key after role adjustments (e.g. barrel demotion). Dual-publish edge-record degrees + unique neighbor degrees; agents should order by `rankScore`, not raw `edgeCount`.                                                                                                                                                    |
| **`roles`**                                                     | Always **inferred** (`test` / `debug` / `barrel` / `entrypoint` / `module`) - never present as observed topology.                                                                                                                                                                                                               |
| **`entrypoints` / `roots`**                                     | Starts split; scripts/debug demoted from entrypoints. `starts` = entrypoints then roots for compat.                                                                                                                                                                                                                             |
| **Neighbor truncation**                                         | File report: arrays + `importsTotal` / `importersTotal` / `truncated`.                                                                                                                                                                                                                                                          |
| **`summary.externalPackageCount`**                              | Alias of external package leaf count - not monorepo package inventory.                                                                                                                                                                                                                                                          |

CLI Exact default does **not** flip web Precision. **Program**, alias rewrite,
SCC / boundary lenses, and analysis-envelope `capabilities[]` are product
direction under [analysis-protocol.md](./analysis-protocol.md) (phases P1–P3+) -
**not** claimed by the current Exact path on this ladder.

## UI copy rules

1. Prefer **export surface** / **Exact (export surface)** over **LSP**.
2. Prefer **Imported LOC (export surface)** over bare **Shaken** when space allows; tooltip must say export decls, not bundler.
3. Inspect headers: **estimate** vs **export surface** (not “exact LSP”).
4. Callsites: always qualify **not type-checked** / **name scan**.
5. Status: **export-surface mode** + engine source (`local` / `cdn` / `inject`).
6. Mixed-language: keep warning that only JS/TS Exact applies (Python and other langs stay estimate / missing engine).
7. Catalog: **File LOC** = whole-file; **Public mass** / **Icebergs** = need Exact (export surface); **Spines** = topology + formula (not mass Exact).
8. Agents/docs: never equate **`surfaceLoc`** with public API; never treat inferred **`roles`** as observed.

## Related

- [analysis-protocol.md](./analysis-protocol.md) - **canonical** multi-host L0–L4 direction
- [scope.md](./scope.md) - product contracts
- [multilang-roadmap.md](./multilang-roadmap.md) - L1 extractor breadth (subordinate to protocol)
- [hub-alluvial-behavior.md](./hub-alluvial-behavior.md) - reverse mass dual-side
- [impact-cheatsheet.md](./impact-cheatsheet.md) - agent impact read order
- Catalog: [analysis-protocol-multi-host](../catalog/entries/analysis-protocol-multi-host.md),
  [exact-surface-mode-futures](../catalog/entries/exact-surface-mode-futures.md)
