# Anivo

Open-source tool that makes explainer videos from diagrams. People use the editor. Agents use the CLI and the MCP server.

Status: phase 0 (spike). See docs/13-roadmap.md.

## Read first

1. [prompts/build-agent.md](prompts/build-agent.md) — your full instructions. Obey them.
2. [docs/00-writing-rules.md](docs/00-writing-rules.md) — write all docs, UI text, and errors in ASD-STE100 style.
3. [docs/01-glossary.md](docs/01-glossary.md) — one term, one meaning.
4. [docs/13-roadmap.md](docs/13-roadmap.md) — find the current phase.

## Key rules (short)

- All scene changes go through the operation bus.
- `evaluate(scene, timeMs)` is pure. No random numbers, no clock.
- Core packages have no DOM and no Node APIs.
- Each feature is available to agents (operation + CLI or MCP).
- Each phase passes its exit gate before the next phase starts.
