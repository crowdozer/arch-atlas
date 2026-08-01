---
id: geometric-vs-knot-architecture
kind: idea
state: partial
authority: exploratory
provenance: mixed

scope:
  - architecture-quality
  - agent-behavior
  - alluvial-import-graph
  - topology-feedback
  - godfiles
  - import-weights
  - geometric-architecture
applies_when:
  - agent writes or refactors code and risks low-energy completion
  - evaluating whether a change improved architecture vs only behavior
  - designing agent personality / architectural review prompts
  - alluvial import graph as architectural insight not just explorer
  - godfile detection and responsibility concentration
  - machine-readable topology metrics for agents
  - before/after architectural diff after a change
  - fan-in fan-out betweenness boundary crossings
  - architectural loss function alongside tests
  - connection validity vs system topology
  - incidental complexity vs architectural complexity
  - boundaries that prohibit invalid connections
  - Level-1 map catalog topology findings (blast radius)
touches:
  - hub alluvial import graph
  - weighted dependency edges
  - semantic buckets / domains
  - agent findings projection
  - topology diff after edit
  - .grok agent personality formulations
  - src/core/catalog/blastRadius.ts
  - fixtures/demo-spaghetti-godfile
invariants: []
open_questions:
  - Which topology metrics are stable enough to drive agent decisions without false godfile signals?
  - How should role (composition root vs utility vs accidental sink) be declared or inferred so "large ≠ bad"?
  - What is the minimal machine-readable projection agents need vs full visual alluvial?
  - Can topology-diff scoring be productized as an architectural loss function, or stay human-interpreted?
  - Where does this live in the pipeline (core analysis only vs agent-facing findings layer)?
  - Should a godfile/concentration catalog bin return, and with what non-opinionated signals?
related:
  - dual-host-shell-stage
realized_by:
  - src/core/catalog/blastRadius.ts
  - src/core/catalog/views.ts
  - src/core/graph/types.ts (CatalogBlast)
  - src/client/renderCatalog.ts
  - src/client/demoFixtures.ts (spaghetti-godfile)
  - fixtures/demo-spaghetti-godfile/
  - src/pages/index.astro (Blast radius + Spaghetti hub demo)
superseded_by: null
rationale_quality: full
---

# Geometric architecture vs AI knots (alluvial as topology feedback)

Conversation direction: why AI-produced systems feel wrong despite solid edges, and why a weighted alluvial import graph can give agents the missing global perception-and eventually an architectural loss function.

**Landed so far (partial, thin catalog only):** Level-1 map catalog surfaces reverse **blast radius** ranks (`catalogBlastRadius`) plus a deliberate **Spaghetti hub** demo fixture. A multi-signal **godfile candidates** bin was tried and **removed** (opinionated / noisy). This is **not** an agent loss function, topology-diff after edit, betweenness/weighted findings schema, or full geometric thesis productized-exploratory idea still mostly open.

## Problem

AI-generated (and AI-refactored) code tends to collapse into a **low-energy completion state**:

- Each new connection is reasonable; functions work; data arrives; behavior holds.
- Surface area grows; global shape weakens.
- The system becomes a **knot**: every strand is securely tied to the next, but nobody decided what the finished knot should look like.

Agents reading a repo file-by-file only experience **local connection validity**. Greps answer “where is this symbol referenced?” They do not answer responsibility concentration, boundary leakage, competing centers, or change blast radius. Without aggregate topology, agents minimize displacement and accrete another valid path-preserving the knot.

“Complexity” is often misnamed: AI code can have **low architectural complexity** (few deliberate abstractions) and **high incidental complexity** (adapters, pass-throughs, duplicated representations, compatibility paths).

## Intent

1. **Vocabulary / agent stance:** treat good architecture as **system topology**, not merely working edges. Prefer **geometric** shape: planes as boundaries, directional dependencies, concept centers, shared axes, distinct lifecycle stages, mental rotatability. Treat **architectural prohibition** (what cannot connect) as a first-class design tool.
2. **Product direction for Arch Atlas:** the alluvial import graph (with weights) should become an **architectural feedback instrument**, not only a human explorer-especially when projected to machine-readable findings agents can reason over, and when regenerated as a **before/after topology diff** after a proposed change.

Short formulations to preserve:

> AI naturally optimizes connection validity. Good architecture optimizes system topology.

> AI code descends toward the nearest executable minimum. Designed code expends energy to cross local minima and reach a more structured basin.

> Working code proves the edges. Architecture proves the shape.

> AI ties reliable knots. Architecture arranges the rope.

Agent checklist before adding a path: one owner per concept, one canonical representation, directional dependencies, explicit lifecycle stages, boundaries that prohibit invalid connections.

## Reasoning

### Geometric vs knotty

Well-designed human architecture is geometric:

- boundaries form planes;
- dependencies point deliberately;
- concepts have recognizable centers;
- similar operations share axes;
- lifecycle stages stay spatially distinct;
- you can mentally rotate the architecture and still understand it.

Preserving geometry sometimes requires **locally awkward** moves: relocating pieces, introducing an abstraction that seems early, refusing the easiest insertion point. AI typically scores those as risk/cost and prefers accretion.

Aggregate-graph defects (when edges are fine):

- too many nodes and slightly different routes;
- too many ownership centers;
- no dominant flow direction;
- abstraction boundaries following implementation history instead of domain geometry.

### Alluvial as missing scale of perception

An alluvial import graph turns architecture into an **explicit spatial object**:

| Question                       | Grep / sequential read | Alluvial topology    |
| ------------------------------ | ---------------------- | -------------------- |
| Symbol usage                   | strong                 | weak                 |
| Responsibility concentration   | weak                   | strong               |
| Mediators between subsystems   | weak                   | strong               |
| Dependency direction reversals | weak                   | strong               |
| Boundary leakage               | weak                   | strong               |
| Pass-through plumbing          | weak                   | strong               |
| Competing concept centers      | weak                   | strong               |
| Reconverging parallel paths    | weak                   | strong               |
| Change blast radius / gravity  | weak                   | strong (with weight) |

**Import weight** matters: unweighted graphs treat every edge as equal. Weight exposes architectural gravity (fan-in infrastructure vs god-module; fan-out composition root vs responsibility sink; thick cross-boundary bands vs thin leakage; reconvergence as duplicated transforms).

Interpretation must use **role + direction**, not size alone:

| Shape                     | Possible healthy              | Possible problem          |
| ------------------------- | ----------------------------- | ------------------------- |
| High fan-in               | Stable shared primitive       | Grab-bag utility          |
| High fan-out              | Composition root              | Godfile                   |
| Thick layer-to-layer flow | Deliberate pipeline           | Missing boundary          |
| Many cross-layer bands    | Legitimate domain integration | Dependency leakage        |
| Narrow waist              | Good canonical interface      | Fragile bottleneck        |
| Parallel flows            | Separate domains              | Duplicate representations |

### Agent-facing projection

Humans judge the visual; agents need derived statements, e.g.:

```json
{
  "file": "src/lib/sentinel.ts",
  "fanIn": 37,
  "fanOut": 22,
  "weightedFanIn": 184,
  "weightedFanOut": 91,
  "domainsTouched": ["agents", "stocks", "ops", "api"],
  "boundaryCrossings": 14,
  "betweenness": 0.73,
  "suspectedRole": "godfile"
}
```

Suspicion is multi-signal: high fan-in **and** fan-out **and** betweenness **and** multi-domain touch **without** being a declared composition root-not “large.”

### Architectural loss function (aspirational loop)

```text
source → static analysis → semantic buckets → weighted topology
  → architectural findings → proposed change → topology diff
```

Compare before/after:

- Did cross-domain flow decrease?
- Did responsibility move toward a canonical owner?
- Did the change create another route?
- Did a narrow waist get cleaner or more overloaded?
- Did a godfile shrink, or scatter into coupled mini-godfiles?

Tests: behavior survived. Graph: shape improved. That attacks low-energy completion-the agent sees what the new edge does to **whole geometry**.

## Rejected alternatives + why

| Alternative                                                  | Why not (for now)                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Treat “largest node = bad” as the godfile rule               | Size without role/direction false-positives stable primitives and composition roots                    |
| Rely on greps / sequential file reads alone for architecture | Local observations cannot recover aggregate topology or gravity                                        |
| Optimize only for connection validity / green tests          | Produces correct knots with weak global shape and high incidental complexity                           |
| Pure visual alluvial for agents without machine projection   | Images help humans; agents need structured findings they can score and cite                            |
| Force heavy abstractions on every AI edit                    | Geometry is about topology and prohibition, not abstraction count; premature layers can also be knotty |

## Open questions

- Metric stability: which of fan-in/out, weighted fan, betweenness, boundary crossings, domains-touched survive noise and still guide agents?
- Role declaration: user-labeled composition roots / public interfaces vs heuristic `suspectedRole`?
- Minimal findings schema for agent context budgets.
- Whether topology-diff scoring becomes automated loss or stays a human/agent interpretive checklist.
- Pipeline ownership: pure core analysis vs agent-facing findings layer (related dual-host split of engine vs stage/shell).

## Revisit when

- Shipping machine-readable topology / findings for agents (beyond thin catalog rows).
- Designing agent personality or “architectural review” steps that go beyond tests.
- Alluvial product work moves from explorer UX to feedback instrument (before/after diff).
- Concrete false positives on godfile / leakage heuristics appear in real repos.
- Product decides whether topology metrics are first-class contracts or experimental probes.
- Extending L1 catalog heuristics (godfiles / blast) toward weighted metrics, role inference, or topology-diff.

## Source

User conversation direction (geometric vs knotty AI code; alluvial import graph as architectural insight and agent feedback). Not elevated to product law-exploratory memory only.
