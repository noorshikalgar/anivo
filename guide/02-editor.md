# 2. The editor

## Draw

- **Tools** (top of the canvas): select (V), hand (H), rectangle (R), ellipse (O), diamond (D), arrow (A), text (T), icon (I), code (C), table, image.
- Double-click a shape to type its label. Double-click empty canvas to add text.
- Drag from one shape to another with the arrow tool. The arrow stays bound when you move the shapes.
- **Icons:** Lucide and Fluent are built in. Click **Add icon pack (folder of SVG files)…** in the icon picker to add your own icons.
- **Images:** drag a PNG, JPEG, WebP, or SVG file onto the canvas, paste it (Ctrl+V), or click **Insert image**. Anivo removes scripts and external links from SVG files.
- **Tables:** click **Insert table**. Double-click a cell to type. Each cell has an ID such as `users-r2c3`, so an action can target one cell.
- **Layout:** select elements and use the command palette: **Align**, **Distribute**, or **Auto layout** (row, column, grid, tree, layered).
- Moving elements snap to an 8 px grid and to the edges and centers of other elements (red guide lines). Hold **Alt** to move freely.
- **Lock** (Ctrl+Shift+L) stops clicks on an element. **Hide in editor** (Ctrl+Shift+H) hides it on the canvas only; the video still shows it. **Unlock and show all elements** is in the command palette.

## Steps and actions

- **Base** is the picture before step 1. Each step adds one change.
- Select a step, select elements, then click **Add action**: enter, exit, emphasis (pulse, shake, glow, flash, highlight, focus, wiggle), flow (particles on arrows), camera (zoom to, pan, reset), count (a number that counts), code (highlight lines, type lines, diff).
- A move or a change is static (all steps) until you record it: press **K** (Record) and change the element at the playhead, or click **◆** next to a property. See [8. Animate](08-animate.md) for keys, the timeline, easing, and more.
- **Timeline:** click the timeline button at the right of the playback bar. Each element has a track with its action blocks and keys.

## Look

- **Style:** clean or sketch (hand-drawn). **Theme:** four built-in themes, or **Edit custom theme…** to change the colors. Export the theme as a JSON file and import it in another scene.
- **Video size:** 16:9, 9:16, 1:1, 4:5, or custom, at 24, 30, or 60 fps.

## Present

Click **Present** (F5). Click or press → for the next step, ← to go back. Press **W** to open the speaker notes in a second window (notes, script line, next step, timer). Press **Escape** to stop.

## Export

Click **Export** (Ctrl+E):

| Format | Notes |
|---|---|
| MP4, WebM | WebM keeps a transparent background. Captions: burned in, or an SRT or WebVTT file |
| GIF | For a README. The dialog shows the size before the export |
| PNG, PNG of each step, SVG of each step | For docs and slides. The SVG files include the fonts |
| HTML player | One file that plays the scene in a browser with no network |

## Files

- **File › Save** writes a `.anivo` file (a ZIP with the scene and its images and audio). Chromium browsers save to the same file again with Ctrl+S.
- Anivo saves your work in the browser 1 second after each change. If the browser closes, Anivo opens your last scene again.
- **File › Import Excalidraw or Mermaid…** makes a scene from an `.excalidraw` file, or from a Mermaid flowchart or sequence diagram. Mermaid imports get steps.
- **History** (top bar) shows each change and who made it: you or an agent.

## Keyboard

Press **?** for all shortcuts.
