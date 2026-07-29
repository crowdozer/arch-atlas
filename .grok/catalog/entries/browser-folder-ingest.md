---
id: browser-folder-ingest
kind: decision
state: active
authority: normative
provenance: user

scope:
  - browser-folder-ingest
  - web-host
  - source-port
  - virtual-files
  - local-first
  - zip-ingest
  - directory-selection
applies_when:
  - opening a repository folder in the web app
  - replacing or supplementing ZIP upload
  - browser directory picker or webkitdirectory
  - adding a local Astro or Vite filesystem endpoint
  - changing web-host ingestion or session open lifecycle
  - sharing directory filters between browser ZIP and CLI
touches:
  - src/core/ingest/
  - src/client/sessionLifecycle.ts
  - src/client/wireUi.ts
  - src/pages/index.astro
  - src/cli/loadFeed.ts
  - VirtualFile[]
invariants:
  - Browser folder ingest requires an explicit user-selected directory and does not accept arbitrary filesystem paths
  - Selected source files stay on-device and enter the existing VirtualFile[] to CodeGraph pipeline
  - Folder and ZIP sources converge before graph indexing rather than creating separate analyzers
  - A local server filesystem endpoint is a last-resort fallback, not the preferred implementation
open_questions:
  - Which supported-browser and fixture matrix is sufficient to call folder selection reliable
  - Whether the existing Carbon uploader can expose directory selection cleanly or needs adjacent folder-specific chrome
  - Where shared path filtering should live so browser ZIP, browser folder, and CLI directory feeds remain aligned without importing Node APIs into pure core
related:
  - dual-host-shell-stage
  - analysis-protocol-multi-host
realized_by: []
superseded_by: null
rationale_quality: full
---

# Browser folder ingest before a local filesystem endpoint

## Problem

The web host currently accepts repository ZIPs even though its analyzer consumes
`VirtualFile[]`, not ZIPs as a durable representation. Requiring developers to
archive a local repository before opening it adds friction. A proposed local
Astro/Vite endpoint could read a filesystem path, but it would add a dev-only
transport, filesystem authority, and security surface solely to obtain the same
file feed.

## Intent

Allow the web app to open a folder selected explicitly by the user. If browser
folder selection proves reliable across the supported environment, it replaces
the need for a local development filesystem endpoint.

ZIP upload remains a useful portable input. Both ZIP and folder inputs should
produce the same normalized `VirtualFile[]` feed and enter the existing session,
graph, catalog, and projection lifecycle.

## Reasoning

Browsers permit user-mediated directory selection and expose each selected
file with a relative path. Arch Atlas can read those files locally, apply its
existing ignore/text/binary policies, and pass them to the current graph
indexer without uploading source or asking a server process to read arbitrary
paths.

This is the smaller conceptual model:

```text
user-selected ZIP ────┐
                      ├─→ VirtualFile[] → CodeGraph
user-selected folder ─┘
```

It preserves the zero-install hosted path, local-first analysis, and the
multi-host rule that hosts inject files while core owns the graph. Reliability
must be demonstrated rather than assumed: relative-path fidelity, nested
directories, ignored paths, binary exclusion, cancellation, large inputs, and
supported-browser behavior all need acceptance coverage.

## Rejected alternatives + why

1. **Prefer a dev-only Astro/Vite filesystem endpoint** — unnecessary if the
   browser folder path is reliable; adds another source owner and allows a
   local server process to read filesystem paths.
2. **Run the CLI or a shell script behind such an endpoint** — adds a child
   process and serialization/error-handling path instead of feeding the shared
   representation directly.
3. **Replace ZIP ingest outright** — ZIP remains useful for hosted, shared, and
   archived inputs; the decision is to converge both sources, not remove one.
4. **Let the browser name an arbitrary local path** — browser security properly
   prevents this; folder access must remain user-mediated.

## Fallback

A local-only filesystem endpoint may be revisited only if the browser folder
path fails the supported reliability bar or a future workflow requires
non-interactive path targeting. If introduced, it should be dev-only,
constrained to an explicitly configured root, and feed the same
`VirtualFile[]` lifecycle. It should not become a second analyzer.

## Open questions

- What exact browsers and versions constitute the supported web environment?
- Is one-shot selection sufficient, or is live refresh after filesystem changes
  a later requirement?
- Should directory feeds strip the selected root exactly as ZIP ingest strips a
  common archive root?
- Which size/file-count limits should be shared across browser sources?

## Revisit when

- Acceptance testing finds unreliable relative paths, traversal, cancellation,
  or input-size behavior in a supported browser.
- The product requires non-interactive folder targeting or filesystem watching.
- Browser directory APIs materially change their compatibility or permission
  model.
- A VS Code/workspace host lands and changes the source-port ownership model.
