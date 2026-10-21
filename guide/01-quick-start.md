# 1. Quick start

## Open Anivo

Use one of these:

- **Docker:** `docker run -p 8080:8080 ghcr.io/noorshikalgar/anivo`. Then open http://localhost:8080.
- **From the source code** (Node 22, pnpm 10): `pnpm install`, then `pnpm dev`. Then open http://localhost:5173.
- **CLI:** `anivo serve my-video.anivo` opens a scene file in the web app on your computer.

**Install it as an app** (optional): in Chrome or Edge, click **Install app** on the home screen. Anivo then opens in its own window, works offline, and opens `.anivo` files. In Safari on a Mac: File › Add to Dock.

The first time, a short tour shows the main parts. Click **Skip** to close it. Press **Ctrl+K** to see all commands.

## Make your first video

1. Click **File › New from template…** and select **How a load balancer works**. Or click **File › New scene** to start with an empty canvas.
2. Press **Space** to play the video. The steps are in the left panel.
3. Select a step. Select an element on the canvas. Click **Add action** in the inspector, for example **Enter › Pop**.
4. To animate a move: press **K** (Record), click the ruler of the timeline at a time, and move the element. Anivo makes a key at that time. With Record off, a move only changes the layout. See [8. Animate](08-animate.md).
5. Click **Export**, select **MP4 video**, and click **Export**.

## Next

- [The editor](02-editor.md): all drawing and animation features.
- [Voice and captions](03-voice-and-captions.md): add your voice.
- [Agents](04-agents.md): let an AI agent make the diagram.
