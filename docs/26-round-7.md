# 26 — Round 7: check motion without a video

Status: plan and build, 2026-10-24. To check a step, an agent (and the build agent) had a contact sheet (the end of each step) or one preview frame at a time. Motion problems happen in the middle of a step: a count that ends before the packet arrives, a packet that passes behind a caption.

| # | Item |
|---|---|
| M1 | Done. **Filmstrip**: `anivo filmstrip <scene> --step 2 --count 6` and MCP `anivo_filmstrip`: frames from the start of a step to the end of its hold, with their times, in one PNG. |
| M2 | Done. **Captions keep the way of a moving element clear**: the path of a move in the step is part of what a caption avoids. |

The CDN showcase (`anivo-demo/cdn`) found both problems; its count now chains to the packet (`after=pk`).
