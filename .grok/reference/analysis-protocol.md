# Analysis protocol & multi-host capability ladder

**Status:** product direction (user-elevated) · **partially realized**  
**Companion catalog:** [analysis-protocol-multi-host](../catalog/entries/analysis-protocol-multi-host.md)  
**Honesty scorecard (current tiers):** [analysis-honesty.md](./analysis-honesty.md)  
**Multi-lang breadth (L1 extractors):** [multilang-roadmap.md](./multilang-roadmap.md)  
**Hosts:** [dual-host-shell-stage](../catalog/entries/dual-host-shell-stage.md)

This is the **canonical direction** for how Arch Atlas analyzes code across
browser, CLI, and (future) VS Code. It does **not** claim every phase is
implemented. Agents must report **which capabilities actually ran**.

## Product thesis

One **architecture compiler protocol**:

```text
Host feed (ZIP | dir | workspace | git-archive)
        ↓
  Host ports only (VirtualFile[], config bytes, alias maps, scope)
        ↓
  Pluggable backends (L1 syntax → L2 resolve → L3 symbols → L4 build)
        ↓
  CodeGraph IR (SoR, pure core) + analysis envelope
        ↓
  Catalog projectors + agent export + UI projections
```

**Do not** build three independent analyzers. Hosts inject I/O and paint;
**`src/core`** owns IR and rankings; semantic backends plug in behind a shared
seam.

## Capability ladder (L0–L4)

Every result should stamp which levels were **available** for this run (not
what the product can do in the best case).

| Cap | Meaning | Current Arch Atlas (typical) |
| --- | ------- | ---------------------------- |
| **L0** | Files + language tags present | **Landed** |
| **L1** | Syntax-level import/export/require declarations | **Landed** for JS/TS + Python + Astro script islands |
| **L2** | Resolved modules (paths, aliases, package exports) | **Partial** — naive resolve + single tsconfig; no Program; optional omit→`omitted` |
| **L3** | Symbols, types, public members, references | **Not landed** — export-declaration **span** LOC is **not** L3 |
| **L4** | Build/bundle/runtime integration | **Not landed** |

### Naming discipline

| Term | Use for | Do not use for |
| ---- | ------- | -------------- |
| **Estimate** | L1 topology + whole-file mass | “full architecture” |
| **Exact (export surface)** | Export-declaration **span** mass overlay (classic AST/text) | Graph re-index, LSP, public API members |
| **Program** (target) | `createProgram` / checker-backed L2–L3 | Current in-tab Exact path |
| **surfaceLoc** (wire today) | Span coverage of export decls | Public-API surface — prefer future `exportDeclarationLoc` |

Export-span mass stamps as **mass capability**, not as L3.

## Hosts & backend authority

| Host | Role | Semantic authority |
| ---- | ---- | ------------------ |
| **Browser** | ZIP/local-first UX; progressive analysis; worker target | L0–L1 always; L2–L3 when worker Program available; fail soft |
| **CLI** | Agent packs, CI, git impact; **reference** cross-lang + TS Program home | Same IR; native adapters first; portable artifact out |
| **VS Code** (future) | Thin host: real workspace, deps, navigation, live invalidate, webview | Prefer installed language features / inject; open CLI/core artifact |

CLI is the **authoritative place to land** compiler-backed JS/TS (Program) and
native adapters before the browser port. VS Code is a **thin incremental
interface**, not a third graph builder.

Tree-sitter (WASM or native) is the **syntax-level baseline** for breadth —
**never** marketed as universal semantic analysis.

LSP is an **enrichment** path (references, hover), not a complete architecture
graph dump.

## Analysis envelope (target shape)

Additive toward agent JSON / portable artifact. Exact field names may evolve;
the **ideas** are load-bearing:

```ts
analysis: {
  capabilities: Array<'L0' | 'L1' | 'L2' | 'L3' | 'L4' | string>;
  capabilityDetail: {
    importGraph: 'syntax' | 'resolved' | 'program';
    mass: 'whole-file' | 'export-declaration-span' | 'public-member' | 'unsupported';
    typeEdges: 'none' | 'import-type-flag' | 'checker';
    aliases: 'none' | 'tsconfig' | 'rewrite-map' | 'program';
  };
  completeness: {
    tsconfig: 'none' | 'partial' | 'full';
    nodeModules: 'absent' | 'partial' | 'present';
    workspaceRoots: number;
    missingLibs?: string[];
  };
  honesty: string; // human contract for this run
}
```

### Scope provenance (every lens)

Stamp what the host **actually** fed: omit globs, includeTests, exact
requested/applied, feed kind, optional alias rewrites, optional **scope
presets** (`product` | `test` | `debug` | `runtime-client` | …).

“Product minus tests” is **not** automatically “runtime product.”

### Edges (direction)

- **Forms:** import | export | require | dynamic (already partial).
- **Phase:** runtime | type | unknown (today: best-effort `typeOnly` flag).
- **toKind:** file | package | unresolved | omitted | (target) unresolved-alias |
  external-to-upload | missing.

### LOC terminology (direction)

| Field | Meaning |
| ----- | ------- |
| `wholeLoc` | Whole-file lines |
| `exportDeclarationLoc` / today’s `surfaceLoc` | Lines covered by export **declaration spans** |
| `surfaceSupport: supported \| unsupported` | Unsupported langs: **null** surface, not zero; exclude from icebergs |
| `publicMemberLoc` / symbol counts | **Later L3** — not private class bodies |

### Truncation

Capped arrays: `shown` / `total` / `truncated` (or equivalent totals + boolean).

### Graph interpretation lenses (direction)

Prefer **interpreting** the graph before adding more traffic rankings:

- Runtime vs type (and later re-export-aware) partitions  
- SCC / cycle summaries (runtime vs type)  
- Barrel / façade **inferred** roles (never observed topology)  
- Entrypoints vs orphan roots  
- Boundary crossings (e.g. public barrel vs deep import)  
- Alias rewrite for isolated ZIPs  

Rankings that say “complex” / “blast” must stay qualified (downwind reach /
reverse-reach, cycle-sensitive).

## Phased delivery (product order)

Do **not** reorder to “browser Program first” or “every language Tree-sitter
first.” Prefer **honest packs + one IR protocol + CLI TS reference**, then port.

| Phase | Theme | Outcome |
| ----- | ----- | ------- |
| **P0** | Pack honesty residuals | Rename/alias exportDeclarationLoc; unsupported null surface; uniform truncation; file-lens capability matrix; complex/blast aliases |
| **P1** | Graph interpretation | Alias rewrite + unresolved taxonomy; runtime/type SCC; boundary crossings; scope presets; façade roles; synthetic acceptance |
| **P2** | Analysis protocol v2 + portable artifact | Capabilities envelope; single pipeline; CLI artifact browser/extension can open |
| **P3** | CLI TypeScript Program | L2 resolve + optional L3 members; completeness stamps |
| **P4** | Browser Program worker | Port P3 host interface; stream enrichment; fail soft to L1 |
| **P5** | Tree-sitter multi-lang L1 breadth | Syntax baseline; always stamp L1 only |
| **P6** | VS Code thin host + LSP enrich | Workspace inject; live updates; LSP annotations not full graph replace |

**Landed relative to this ladder (ship `552b25eb` and earlier):** L0–L1 IR;
CLI Exact-default export-span mass; roles/entrypoints/roots; typeOnly flag;
omitted targets; unique degrees; scope stamp; dual-host shell/stage partial;
agent CLI host. **Not** P1 SCC/alias-rewrite product, **not** P2 envelope,
**not** Program.

## Acceptance style (artillery-shaped)

Prefer **laws** over brittle full-rank snapshots. Synthetic
artillery-shaped fixtures in-repo; optional local real ZIP path — do not
require multi-MB game submodules in default CI.

Example laws (by phase):

| Law | When |
| --- | ---- |
| Type barrel not top hotspot by rankScore | P0–P1 |
| Façade/`public.ts` not called godfile | P1 |
| Runtime SCC captures sim / config knots | P1 |
| `import type` excluded from runtime reach | P0–P1 / P3 hard cases |
| Alias rewrite resolves `@/modules/…` | P1 |
| Omitted targets ≠ unresolved | P0 (partially landed) |
| Astro not zero-surface iceberg | P0 (partially landed) |
| Capabilities stamp L1 vs L2/L3 honestly | P2–P3 |

## Invariants

1. **CodeGraph is SoR** — hosts and backends enrich; they do not fork IR.  
2. **`src/core` pure** — no DOM, vscode, fetch.  
3. **Capability stamps required** as the protocol lands — never market L1 as L3.  
4. **Epistemic layers** — roles, scope presets, boundary heuristics stay **inferred** until declared.  
5. **Local-first** — source stays on-device; agent export is sanitized graph, not raw source by default.  
6. **Exact export-surface today ≠ Program** — until P3/P4 land.

## Related

- [analysis-honesty.md](./analysis-honesty.md) — current Estimate / Exact scorecard  
- [scope.md](./scope.md) — product contracts  
- [impact-cheatsheet.md](./impact-cheatsheet.md) — agent impact recipes  
- Catalog: [analysis-capability-honesty](../catalog/entries/analysis-capability-honesty.md),
  [exact-surface-mode-futures](../catalog/entries/exact-surface-mode-futures.md),
  [dual-host-shell-stage](../catalog/entries/dual-host-shell-stage.md),
  [mermaid-structure-graph](../catalog/entries/mermaid-structure-graph.md),
  [interchangeable-atlas-lenses](../catalog/entries/interchangeable-atlas-lenses.md)
