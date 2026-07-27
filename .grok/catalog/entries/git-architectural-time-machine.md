---
id: git-architectural-time-machine
kind: idea
state: active
authority: exploratory
# Partial land: CLI two-ref topology impact (agent-impact.v1) only — not full Evolution
provenance: mixed

scope:
  - git-history
  - evolution
  - co-change
  - churn
  - line-age
  - architecture-diff
  - dual-host
  - cli-host
  - vscode-extension
applies_when:
  - git history age churn co-change overlays
  - architectural time machine or evolution lens
  - line-age heatmap or fossil map
  - co-change edges vs import edges
  - architecture diff between refs or PRs
  - historical playback of dependency graph
  - repair gravity or knowledge map from blame
  - attaching .git metrics to static graph
  - Evolution view in multi-lens atlas
touches:
  - hosts with filesystem checkout (CLI, future extension)
  - not default web ZIP path
  - future historical edge kinds on or beside CodeGraph
  - hierarchical-heatmap-lens heat switcher
  - interchangeable-atlas-lenses Evolution slot
  - conversation.md diff mode vision
invariants:
  - Git enrichment is host-gated; web ZIP remains useful without .git
  - Historical signals stay epistemically distinct from Observed AST imports
  - Prefer meaningful snapshots (releases, tags, change-points) over raw commit spam
open_questions:
  - Representation: parallel historical graph vs edge attributes vs side table
  - First ship: line-age heat vs co-change edges vs two-ref architecture diff
  - How much git work belongs in pure core vs host injectors
  - Privacy: authorship maps in local-only vs any export
related:
  - interchangeable-atlas-lenses
  - hierarchical-heatmap-lens
  - dual-host-shell-stage
  - geometric-vs-knot-architecture
realized_by:
  - src/core/export/agentImpact.ts
  - src/cli/loadGitRef.ts
  - src/cli/main.ts (impact command)
  - .grok/reference/impact-cheatsheet.md
superseded_by: null
rationale_quality: full
---

# Git as architectural time machine

## Problem

Static maps answer “what exists and who imports whom.” They do not answer how
the system **became** that way, which seams are historically unstable, or which
files co-evolve without importing each other. Diff mode is already in vision
notes but not a host-ready model.

## Intent

When a host can see `.git`, Arch Atlas gains an **Evolution** dimension:

| Signal | Why it matters |
| ------ | -------------- |
| Line-age / survival | Median line age ≠ last-touch; distinguishes stable vs rewritten mass |
| Churn overlay | Age without activity is ambiguous |
| Co-change edges | Empirical coupling invisible to imports |
| Architecture diff (two refs) | PR-scale “shape change,” not only LOC delta |
| Playback with detected events | Narrative of corridors forming / god-modules emerging |

Static × historical composites (names only; not specs): fossil map, fault map,
knowledge map, migration map.

Strongest **initial** Git features if prioritized later:

1. Line-age heatmap  
2. Churn overlay  
3. Co-change edges  
4. Architecture diff between two refs  
5. Event-aware historical playback  

## Reasoning

- Aligns with confirmed vision (diff mode, reweight by churn later) without
  forcing Git into browser ZIP MVP.
- Dual-host reality: CLI and future VS Code see checkouts; web ZIP often does not.
- Co-change is one of the highest **differentiating** ideas vs dep viewers, but
  expensive and host-specific — catalog now so Phase A static work does not
  invent a dead-end model that cannot accept historical edges later.
- Epistemic honesty: co-change and blame aggregates are **Inferred** / historical
  evidence, never presented as AST-observed imports.

## Rejected alternatives + why

| Alternative | Why not |
| ----------- | ------- |
| Git required for any heatmap | Blocks Level-1 static heat; wrong capability ladder |
| Commit-by-commit playback as primary UI | Noise; prefer change-points / tags / releases |
| Remote history analysis service | Fights local-first default |
| Shipping Evolution before heatmap/matrix | Higher host cost; weaker on pure ZIP demos |

## Open questions

See frontmatter.

## Revisit when

- ~~CLI or extension plans include git-backed feeds.~~ Thin land: `impact`
  command + `loadGitRef` (git archive) + pure `buildAgentImpact`. Still no
  line-age / co-change / playback / Evolution UI.
- Deepening architecture diff (rename intelligence, forbidden boundaries,
  Exact mass deltas) or PR review projections.
- Designing heat switcher extensibility (static vs historical layers).

## Provenance

Design chat Git expansion + research deferral ranking. Exploratory; not Phase A.
Partial experiment: two-ref import-topology impact CLI (see `realized_by`).
