---
id: analysis-protocol-multi-host
kind: decision
state: partial  # P0–P2 landed; P3+ open
authority: normative
provenance: user

scope:
  - analysis-protocol
  - capability-ladder
  - multi-host
  - agent-export
  - typescript-program
  - tree-sitter
  - vscode-extension
  - cli-host
  - browser-worker
  - graph-interpretation
  - epistemic-honesty
applies_when:
  - analysis protocol or capability ladder L0 L1 L2 L3 L4
  - multi-host analyzer design browser CLI VS Code
  - Exact vs Program vs Estimate naming
  - agent pack honesty schema envelope
  - TypeScript createProgram CompilerHost worker
  - Tree-sitter multi-language baseline
  - portable atlas artifact
  - alias rewrite isolated ZIP
  - SCC cycle boundary lenses
  - exportDeclarationLoc surfaceLoc public API mass
  - planning next analysis ships after agent lens signal
  - claiming LSP or universal semantic analysis
touches:
  - .grok/reference/analysis-protocol.md
  - .grok/reference/analysis-honesty.md
  - .grok/reference/scope.md
  - src/core graph + export + catalog
  - src/cli
  - src/exact
  - src/client
  - extension/ (future)
  - analysis-capability-honesty
  - exact-surface-mode-futures
  - dual-host-shell-stage
invariants:
  - One CodeGraph IR and analysis protocol across hosts — no three independent analyzers
  - src/core stays pure (no DOM, vscode, fetch)
  - Every result should report capabilities actually available
  - L1 syntax must never be marketed as L3 semantic analysis
  - Exact export-surface span mass is not Program and does not re-index topology until Program phase
  - Tree-sitter is syntax baseline only; LSP is enrichment not full graph dump
  - CLI is reference home for compiler-backed JS/TS before browser Program port
  - Roles scope presets and boundary heuristics stay inferred until declared
open_questions:
  - Alias rewrite UX (CLI only vs web remembered maps)
  - Artillery real ZIP in CI vs synthetic-only goldens
  - When to hard-bump agent schema to v2 vs additive v1
  - Whether product renames Exact tier in UI when Program lands
related:
  - analysis-capability-honesty
  - exact-surface-mode-futures
  - dual-host-shell-stage
  - mermaid-structure-graph
  - interchangeable-atlas-lenses
  - hierarchical-heatmap-lens
  - dependency-structure-matrix
realized_by:
  - 59f7674
  - 305c49d
  - eda4bb3
  - fcd2cb2  # Ship A P0 honesty
  - b1c8b35  # protocol docs
  - 7792882  # Ship B P1 graph interpretation
  - 2859d22  # Ship B czar fixes
  - c1767c2  # Ship C protocol envelope
  - 587926b  # Ship C pickAliasConfig single owner
  - 41889f8  # P3 createProgram
  - 49c6cf0  # P3 L2 stamp honesty
superseded_by: null
rationale_quality: full
---

# Analysis protocol — multi-host capability direction

## Problem

Agent-blind reviews of real submodules (e.g. artillery) showed a strong graph
substrate but rankings and “Exact” naming that over-promise. Export-span mass
is useful; it is not a better import graph. Building separate browser / CLI /
VS Code analyzers would fork IR and honesty. Marketing L1 syntax as L3
semantics destroys trust.

## Intent

**Canonical product direction:** one analysis protocol, one CodeGraph IR, explicit
**L0–L4 capability stamps**, multiple execution backends (browser worker, CLI,
VS Code thin host). Graph **interpretation** (roles, type/runtime edges, alias
resolve, SCC, boundary) before ranking accretion. CLI lands Program/native
reference first; browser ports the same seam; extension stays thin.

**Live contract (SoR for this decision):**
[.grok/reference/analysis-protocol.md](../../reference/analysis-protocol.md)

## Reasoning

- Graph SoR + pure core already match dual-host; protocol makes capability
  honest across hosts.
- Agent packs need interpretation + stamps more than more bins.
- Program in browser is valuable but expensive — prove IR + CLI Program first.
- Tree-sitter and LSP are correct as **breadth** and **enrichment**, not as
  “one graph to rule all languages.”
- Phases P0–P6 give ship-sized slices without multi-PR redesign theater.

## Rejected alternatives + why

| Alternative | Why not |
| ----------- | ------- |
| Three host-specific analyzers | Divergent IR, divergent honesty, untestable |
| Browser Program before pack/protocol | High cost before agent signal laws |
| LSP as primary architecture builder | Query API ≠ complete graph; overclaims easy |
| Tree-sitter as universal semantics | Syntax only; stamp L1 |
| More ranking bins without edge/role/resolve | Confident noise (artillery lesson) |
| Claiming current Exact re-indexes graph | False; honesty ladder forbids |

## Open questions

See frontmatter. Also: portable artifact format (single JSON vs multi-file);
streaming enrichment UX in worker.

## Revisit when

- Shipping any Program, alias-rewrite, SCC, or agent schema envelope work.
- Naming “Exact” confuses users/agents after Program lands.
- Multi-lang Tree-sitter or VS Code host starts.
- Artillery-shaped acceptance needs fixture policy change.

## Provenance

User-elevated after agent-pack feedback (Estimate + Exact artillery) and
post-ship `552b25eb` ranking honesty. Normative multi-host / capability
direction; phases partial (P0 residuals + P1+ open).

## Ship order (summary)

| Ship | Phase | Focus |
| ---- | ----- | ----- |
| A | P0 | Residual honesty (LOC names, unsupported null, truncation shape, file-lens caps) |
| B | P1 | Graph interpretation (alias rewrite, unresolved kinds, SCC, boundary, scope presets) + synthetic goldens |
| C | P2 | Analysis envelope + portable artifact |
| D | P3 | CLI TypeScript Program |
| E | P4 | Browser Program worker |
| F+ | P5–P6 | Tree-sitter breadth; VS Code thin host; LSP enrich |

Detail and acceptance laws: reference doc.
