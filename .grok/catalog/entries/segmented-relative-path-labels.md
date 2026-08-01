---
id: segmented-relative-path-labels
kind: idea
state: active
authority: exploratory
provenance: user

scope:
  - path-labels
  - file-tree
  - path-resolution
  - alluvial-labels
  - catalog-ui
  - inspect
  - navigation-context
applies_when:
  - intelligent path resolution without LSP
  - displaying file paths in tree catalog or alluvial
  - relative path labels from current focus node
  - path segment walk or breadcrumb-style labels
  - basename-only labels feel too lossy
  - full absolute paths clutter hub or catalog chrome
  - labeling imports after resolve-to-tree
  - FileLoc / catalog list path display polish
  - truncating long paths with tree-aware segments
touches:
  - src/core/tree/fileTree.ts
  - src/core/view/alluvial.ts (basename / fileLabels)
  - src/client/app.ts (tree name paint, catalog rows)
  - alluvial label truncate polish
  - future path resolution / import resolve (sans-LSP)
  - graph file ids as tree paths
invariants: []
open_questions:
  - What is the "current node" for relative walk - focus file, selected tree folder, view-stack package, or alluvial File spine id?
  - Segment model: re-split string paths vs store segments on FileTreeNode and reuse?
  - Pretty label grammar - `../lib/foo.ts`, `src › lib › foo.ts`, or elided mid-walk (`src/…/foo.ts`)?
  - Does this wait on a dedicated resolve layer, or can partial tree-known paths ship first?
  - Multi-instance hub labels (`path · hN`) - relative walk from primary path only?
related:
  - dual-host-shell-stage
  - alluvial-top-pack-rename-split
realized_by: []
superseded_by: null
rationale_quality: full
---

# Segmented relative path labels (tree-aware path walk)

Exploratory UX idea from user. **Depends on** intelligent path resolution that
maps imports/ids to real files **without LSP** - not a request to implement
resolution here.

## Problem

- File identity is a full path string; UI often shows either **full path**
  (noisy, truncates badly) or **basename only** (collides, loses hierarchy).
- Naive `path.split('/')` is not the same as **segments that exist in the
  indexed tree** - resolution failures, virtual roots, and package externals
  make string splits lie.
- Once resolve-to-tree works, labels still need a **context-sensitive** display:
  from the node the user is looking at, not a fixed repo-root dump.

## Intent

1. After intelligent path resolution (sans-LSP) is reliable, treat a resolved
   file as a **sequence of tree segments** that actually appear in the file
   tree, e.g. `[src, lib, somefile.ts]`.
2. Render paths **relative to the current node** (focus / selection / navigated
   folder) so the label encodes a short **path walk** rather than a global
   absolute string.
3. Prefer **pretty, walk-reflecting labels** (readable segment steps) over raw
   full paths or bare basenames - same identity, better local context.

## Reasoning

- Tree SoR already has segment names on nodes (`FileTreeNode` name = folder or
  file basename). Labels should reuse that structure once ids resolve onto it.
- Relative-to-current-node matches how humans talk about nearby files when
  inspecting imports or catalog rows from a focused file.
- Truncation and alluvial polish already fight long paths; tree-aware segments
  give better elision points than character-level right-truncate alone.
- Keeping this **post-resolution** avoids pretty-labeling unresolved or
  external package strings as if they were tree walks.

## Rejected alternatives + why

| Alternative                          | Why not (for now)                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Always show full path from repo root | Clutters hub/catalog; fails on long monorepos; ignores current-node context                    |
| Basename-only forever                | Cheap, but ambiguous under duplicate names; wastes tree structure once resolve works           |
| String-split without tree membership | Segments may not match indexed tree (virtual prefixes, unresolved imports, case/normalization) |
| LSP-backed path display first        | Product default remains level-1 static / local-first; idea is explicitly **sans-LSP**          |
| Ship pretty labels before resolve    | Labels would invent walks for unresolved edges - wrong product signal                          |

## Open questions

- **Current node** definition across tree click, catalog row, alluvial focus,
  and inspect drawer - one API or surface-specific?
- Label grammar and accessibility (`title` = full path, visible = relative walk).
- Interaction with existing right-truncate / multi-instance (`· hN`) polish.
- Whether package/external nodes get a different relative grammar than files.

## Revisit when

- Intelligent import/path resolution (sans-LSP) lands or stabilizes.
- Catalog / tree / alluvial labels are being redesigned for density.
- Dual-host shell shares one path-label helper for web + extension.
- Users hit basename collisions or unreadable full-path chrome in demos.
