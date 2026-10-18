# 0004 — Built-in layered layout instead of ELK.js

- Status: accepted
- Date: 2026-10-18
- Changes: [04](../04-features.md) FR-CANVAS-16 ("Uses ELK.js for the layered graph")

## Context

FR-CANVAS-16 said: auto layout uses ELK.js for the layered graph.
The layout runs in core code (`packages/layout`), in the browser, in Node, and in the player. Core code must be synchronous and deterministic.
ELK.js is large (more than 1 MB), and its normal API is asynchronous (a worker).

## Decision

Use a small built-in layered layout (`packages/layout/src/auto.ts`), a Sugiyama method: remove back edges with a depth-first search, rank by the longest path, order each rank with barycenter sweeps, and center each rank. Row, column, grid, and tree layouts use the same module.

## Reasons

1. It is synchronous and deterministic, with no new dependency.
2. Explainer diagrams are small (fewer than 50 nodes). The simple method gives clear results for them.
3. The Mermaid import uses the same layout.

## Consequences

- Very large graphs can have more edge crossings than with ELK.js.
- Edge routing stays with the connector router (straight, elbow, curved).
