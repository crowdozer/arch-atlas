# Arch Atlas

Local-first architecture compiler: upload a repository (ZIP/files), receive an
**explorable architectural atlas**. Alluvial diagrams are the signature visual;
the durable core is a normalized semantic graph plus framework-suggested views.

Source stays on-device — analysis is browser/local-first for a constrained
language set.

## Status

Greenfield scaffold. Stack: **Astro + TypeScript (minimal)**.

UI design language tracks **Sentinel** (Carbon, zinc/emerald, alluvial) — not
installed yet; product domain is separate.

## Setup

```bash
cd ~/git-personal/arch-atlas
npm install
npm run dev
```

## Product sketch

```text
ZIP/files → language parsers → normalized graph → framework classifiers → suggested views
```

Open on a **map catalog** (detected stack + generated views), not a blank canvas.
See [.grok/reference/scope.md](.grok/reference/scope.md) and
[.grok/reference/conversation.md](.grok/reference/conversation.md).

## Agents

See [AGENTS.md](AGENTS.md). Global Grok roles load from
`~/git-personal/dotfiles/grok/skills/`; this repo only keeps the `.grok` overlay.
