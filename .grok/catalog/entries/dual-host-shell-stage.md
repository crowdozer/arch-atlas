---
id: dual-host-shell-stage
kind: plan
state: active
authority: advisory
provenance: mixed

scope:
  - dual-host
  - shell
  - stage
  - vscode-extension
  - core-engine
  - alluvial-viz
  - web-host
  - injectors
applies_when:
  - dual-host architecture
  - VS Code extension adapter
  - extract shell or stage from app.ts
  - shared engine and graph viz
  - injectable host shells
  - webview stage bundle
  - workspace index vs ZIP ingest
  - map catalog TreeView
  - browser vs extension packaging
  - host ports SourcePort CatalogPort StagePort
touches:
  - src/core
  - src/shell
  - src/stage
  - src/client/app.ts
  - extension/
  - hosts as injectors
  - AlluvialChart mount
  - viewStack navigation
  - indexFiles
invariants:
  - Graph (CodeGraph) remains source of record; hosts only feed VirtualFile[] and paint projections
  - src/core stays pure — no document, no vscode
  - Level-1 static analysis remains default; Exact/LSP is a later vertical
  - Local-first — web ZIP and VS Code workspace both on-device
  - Astro remains the fast paint loop until stage is extract-stable
open_questions:
  - How deep TreeView catalog parity goes after scaffold (not required for first land)
  - Whether stage eventually owns controls DOM fully vs web-only Carbon dropdown IDs
  - Exact surface via TS Program in-worker vs VS Code language features only
related:
  - alluvial-top-pack-rename-split
realized_by: []
superseded_by: null
rationale_quality: full
---

# Dual-host: shared engine + stage, injectable shells

Approved ship plan (Gate A, run `3e810aae`) — **not yet implemented**.
Source research/plan: conversation dual-host research; ship plan dual-host
minimal rewrite.

## Problem

- Product needs a path to **VS Code** (workspace FS, future multi-LSP) without
  abandoning the **fast Astro web loop** (ZIP upload, local-first demo).
- `src/client/app.ts` (~1.8k lines) owns session navigation, tree/catalog paint,
  and Carbon alluvial mount — host-coupled god controller blocks dual-target.
- Shipping a full browser multi-LSP is infeasible; extension host is the natural
  place for arbitrary language servers later.
- Rewriting the whole UI for VS Code would destroy iteration speed and fork the
  graph model.

## Intent

- **One engine** (`src/core`): `VirtualFile[]` → graph → catalog → projectors.
- **One stage** (`src/stage`): alluvial mount, polish, click callbacks (DOM +
  Carbon Charts) — same artifact in browser and webview.
- **One shell logic** (`src/shell`): pure view stack, payload projection,
  captions, webview message types — no host I/O.
- **Two injectors:**
  - **Web:** ZIP/upload/demos/localStorage + custom tree/catalog chrome (Astro).
  - **VS Code:** workspace walk + TreeView/commands + WebviewPanel for stage.
- Minimal first land: extract seams + **compileable extension** that indexes via
  core and opens a stage panel stub — not full TreeView catalog parity.

## Reasoning

| Option | Verdict |
| ------ | ------- |
| Browser-only + ship TS LS in tab | Feasible for Exact-on-TS only; weak for arbitrary LSPs; heavy heap |
| VS Code-only rewrite | Loses ZIP/demo/zero-install story and fast paint lab |
| Dual-host, identical shell everywhere | Fails — Explorer/TreeView ≠ Carbon drawer; full-bleed layout differs |
| Dual-host: shared engine+stage+shell logic; **injectable chrome** | Fits contracts; sidebar aesthetics may diverge (accepted) |

Weight of “JS LSP in tab” (~MB download + editor-class heap) and native LSP
reality pushed **Exact/multi-lang** off the critical path of host migration.
Sidebar aesthetic change is acceptable; **close behavior** on catalog/tree
selection → file-hub is enough.

## Rejected alternatives + why

1. **Kill Astro day one / live only in Extension Host F5** — destroys the fast
   iteration loop that makes chart work cheap; dual-host keeps Astro as paint lab.
2. **Full TreeView + full stage wire in one PR** — scope blowup; plan is
   scaffold + ports + extract, not product parity.
3. **Put `vscode` or DOM into `src/core`** — breaks pure tests and dual-host.
4. **Share entire Astro drawer markup in webview as “the” VS Code UI** —
   underuses platform; still sits inside workbench chrome; not “exactly as now.”
5. **Monorepo hosts/web + hosts/vscode with Astro move** — more churn than
   keeping Astro at root + `extension/` for minimal ship.
6. **Full LSP protocol in browser for multi-language** — most servers are native;
   extension path is where arbitrary LSPs actually work.

## Architecture sketch (target)

```text
src/core/     pure engine
src/shell/    pure session/nav/project/messages
src/stage/    DOM alluvial (browser + webview)
src/client/   web host adapter (ZIP, tree, catalog paint, persist)
extension/    VS Code host adapter (workspace, commands, webview)
```

Web: shell + stage **in-process**.  
VS Code: shell on extension host; stage via **postMessage** (`messages.ts`).

## Implementation slice (when realized)

1. `src/shell` — types, navigation, project, messages + unit tests  
2. `src/stage` — mount/clicks; move `alluvialTopPack`  
3. Rewire `app.ts`; path aliases `@shell`, `@stage`  
4. `extension/` — compile, Index Workspace → `indexFiles`, stage panel stub  
5. Root scripts `extension:compile`; README/AGENTS docs  

**Out of scope for first land:** TreeView catalog parity, Exact LSP, ZIP-in-
extension, marketplace publish.

## Open questions

- Depth of catalog TreeView after scaffold.
- Whether controls (depth/weight/precision) fully move into stage bundle or
  stay web-DOM-bound longer.
- Exact imported surface: in-browser TS Program vs host language features only.

## Revisit when

- First extension compile + web parity land → set `state: partial`, fill
  `realized_by`.
- TreeView catalog or full stage message loop ships → update partial/implemented.
- Product drops web or drops VS Code → supersede or reject with note.
- Exact/LSP work starts → related entry; do not overload this plan.

## Provenance

- User: research on LSP weight vs VS Code; dual-host injectable shells; `/ship`
  then **catalog only** (do not implement).
- Agent: research brief, approved Gate A plan `ship/3e810aae-dual-host-adapter`.
- Authority **advisory** (approved direction for dual-host minimal rewrite;
  not elevated to normative product law).
