# 02 — Vision and scope

## Problem

Many technical YouTube channels show animated diagrams. Examples are boxes that appear, arrows that draw, and data that moves along connections.
Today a creator makes these with Adobe After Effects, Apple Keynote, or code tools such as Motion Canvas and Manim.

Each current tool has a problem:

| Tool | Problem for diagram videos |
|---|---|
| After Effects | Expensive subscription. Slow to learn. An arrow is only a shape. It does not know what it connects. |
| Keynote / PowerPoint morph | No flow, no voiceover sync, poor video export control. Keynote is macOS only. |
| Motion Canvas / Remotion / Manim | The user must write code. There is no drawing canvas. |
| Excalidraw | Good drawing. No timeline, no video export. |
| Excalidraw animation forks | Early tools. Most have presets only. No voiceover sync. No agent interface. |
| Jitter, Rive, SVGator | Closed source. General motion design. Not made for diagrams. |

## Vision

**Draw a diagram. Divide it into steps. Get a smooth explainer video in minutes.**
An AI agent can do the same through a CLI or an MCP server.

One sentence: **Excalidraw + Keynote Magic Move + flow on connectors + voiceover sync → MP4.**

## Product principles

1. **Steps first, keyframes second.** The user thinks in steps. Anivo calculates the keyframes. Fine timing control is available but not required.
2. **Diagram-aware motion.** Anivo knows that a connector joins two elements. It uses this information to animate.
3. **Simple must not look cheap.** Good easing, 60 fps, and clean export are mandatory.
4. **A person and an agent are equal users.** Each feature is available through the UI and through operations.
5. **The agent can see its work.** Each agent tool can return a preview image and lint results.
6. **Local first.** The web app works without a server. Files stay on the user's computer.
7. **Open files.** The scene file is plain JSON. A person can read it, and Git can show its changes.
8. **Deterministic.** The same scene and the same time always give the same frame.

## Target users

| User | Need | Main path |
|---|---|---|
| Tech YouTuber | Explainer visuals for videos, fast | Web app, manual. CLI for ProRes |
| Teacher, trainer | Animated diagrams for lessons and slides | Web app, present mode |
| Developer, writer of docs | Short GIF or embed for a README or docs site | Web app, player, CLI |
| Agent user (for example Claude Code) | "Make a video that explains this code flow" | CLI and MCP server, headless |
| Team or company | A private instance, inside the company network | Docker image |

## Goals for version 1.0

1. A new user makes a 6-step video with flow and exports MP4 in less than 15 minutes.
2. An agent makes a valid 6-step video from one prompt through the MCP server with no human edit, in 8 of 10 test prompts.
3. Export of a 60-second 1080p60 video takes less than 2 minutes on an Apple M1 laptop in Chrome.
4. The editor shows the preview at 60 fps with 300 elements on screen.
5. A team runs its own instance with one `docker run` command.

## Non-goals

These items are not in scope. Do not build them unless the roadmap changes.

- Character animation, rigging, or bone animation.
- 3D scenes. (A 2.5D camera tilt is a possible later item.)
- Video editing: cuts, clip timelines, transitions between video clips. Use DaVinci Resolve or Premiere for this.
- Compositing over live video footage inside Anivo. Anivo exports a transparent video for this use.
- Frame-by-frame drawing (traditional animation).
- A general vector design tool. Anivo is not Figma.
- Anivo does not host a public gallery or a social feed in version 1.0.

## Success metrics after release

| Metric | Target at 6 months |
|---|---|
| GitHub stars | 3,000 |
| Monthly active web app users | 5,000 |
| Videos exported per month | 10,000 |
| MCP server installs (npm downloads of the CLI) | 2,000 per month |
| Median time from new scene to first export | Less than 15 minutes |

> **NOTE:** These are planning targets. They are not commitments. Telemetry is off by default (see [12](12-quality-and-security.md)), so measure with opt-in data and npm counts only.

## Positioning

Anivo is not "an After Effects replacement". Anivo covers approximately 80% of tech explainer visuals: diagrams that change over time.
For other work, the user exports a transparent video from Anivo. Then the user finishes the video in a video editor.
