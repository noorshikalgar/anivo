# Anivo

> *Anivo* comes from "animate". Say it "a-NEE-vo". The name is short and easy to say.
> It has no bad meaning in Hindi or Marathi. Earlier working names were removed: "Muto" (bad meaning in Hindi and Marathi) and "Kino" (crowded on npm, with a similar product).

Anivo is an open-source tool that makes explainer videos from diagrams.
You draw boxes, text, arrows, and icons. You divide the diagram into steps.
Anivo animates the changes between the steps and exports a video.

A person can use Anivo by hand. An AI agent can use Anivo through a CLI or an MCP server.
Both use the same operations, so a person and an agent can work on the same scene.

Status: **phase 1 (MVP editor) in progress.** The editor, the animation engine, and video export work.

## Run Anivo

With Docker:

```bash
docker build -f docker/Dockerfile -t anivo .
docker run -p 8080:8080 anivo
```

Then open http://localhost:8080.

For development (Node 22 and pnpm 10):

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173. Other commands: `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`,
`pnpm render:template load-balancer out.mp4` (render a template with the Node engine).

The `anivo` command-line tool (for people and agents):

```bash
pnpm anivo new demo.anivo --template load-balancer
pnpm anivo print demo.anivo > demo.anivo.txt
pnpm anivo apply demo.anivo demo.anivo.txt --mode replace
pnpm anivo lint demo.anivo
pnpm anivo contact-sheet demo.anivo --out sheet.png
pnpm anivo render demo.anivo --out demo.mp4
```

Run `pnpm anivo --help` for all commands.

## Read the documents in this sequence

| # | Document | Contents |
|---|---|---|
| 00 | [Writing rules](docs/00-writing-rules.md) | The ASD-STE100 rules that all documents and prompts obey |
| 01 | [Glossary](docs/01-glossary.md) | Each term has one meaning. Read this before all other documents |
| 02 | [Vision and scope](docs/02-vision-and-scope.md) | Problem, users, goals, non-goals, success metrics |
| 03 | [User journeys](docs/03-user-journeys.md) | Personas, flows, and five example videos |
| 04 | [Features](docs/04-features.md) | All features, with priority and acceptance criteria |
| 05 | [Scene model](docs/05-scene-model.md) | Data model, file format, schema versions |
| 06 | [Animation engine](docs/06-animation-engine.md) | Steps, actions, timing, easing, morph, flow, camera |
| 07 | [Rendering and export](docs/07-rendering-and-export.md) | Renderer, styles, fonts, video export |
| 08 | [Audio and captions](docs/08-audio-and-captions.md) | Voiceover, cues, alignment, captions |
| 09 | [Agent interface](docs/09-agent-interface.md) | Operations, Anivo Script, CLI, MCP, preview loop, lint |
| 10 | [Architecture](docs/10-architecture.md) | Packages, data flow, technology stack |
| 11 | [Distribution](docs/11-distribution.md) | Web app, Docker, desktop app, CLI, player |
| 12 | [Quality and security](docs/12-quality-and-security.md) | Tests, performance budgets, security, licenses |
| 13 | [Roadmap](docs/13-roadmap.md) | Phases and exit gates |
| 14 | [Risks and open questions](docs/14-risks-and-open-questions.md) | Known risks and decisions that are not made |

## Prompts

| Prompt | Use |
|---|---|
| [prompts/build-agent.md](prompts/build-agent.md) | System prompt for the coding agent that builds Anivo |
| [prompts/scene-agent.md](prompts/scene-agent.md) | System prompt for the agent that makes videos with Anivo |

See [BRANCHING.md](BRANCHING.md) for the branch and commit rules.

## Short summary of the decisions

- **One codebase.** Version 1.0 ships as a web app (also a Docker image), a CLI with an MCP server, and an embeddable player.
- **Web first. Desktop last.** The desktop app comes only after users know Anivo (adoption gate in the roadmap).
- **All edits are operations.** The UI, the CLI, the MCP server, and undo/redo use the same operation set.
- **The timeline is a pure function.** `evaluate(scene, timeMs)` gives the same frame each time. This makes seek, export, and tests reliable.
- **Agents get a text format.** Anivo Script is a short text language for scenes. Agents write it with fewer tokens than JSON.
- **Agents can see their work.** The preview tool returns a PNG image of a step, and the lint tool returns layout problems.
- **License: MIT.**
