# 5. Command line

The `anivo` command needs Node 20 or later. Video export needs FFmpeg.

| Command | Use |
|---|---|
| `anivo new my.anivo --template load-balancer` | Make a scene (from a template) |
| `anivo apply my.anivo script.txt [--mode append]` | Change a scene with Anivo Script |
| `anivo print my.anivo` | Show the scene as Anivo Script |
| `anivo lint my.anivo` | Check layout and timing. Exit code 1 for errors |
| `anivo preview my.anivo --step 2 --out p.png` | One frame as PNG |
| `anivo contact-sheet my.anivo --out sheet.png` | All steps in one picture |
| `anivo pace my.anivo 1.25` | Make the whole video 25 % slower (0.8: faster) |
| `anivo filmstrip my.anivo --step 2 --count 6 --out strip.png` | Frames across one step: check how it moves |
| `anivo export my.anivo --out my.mp4` | Video: mp4, webm, gif, prores (.mov), png-seq, svg-steps |
| `anivo html my.anivo --out my.html` | One HTML file that plays the scene |
| `anivo captions my.anivo --out my.srt` | Captions from the script |
| `anivo import diagram.mmd --out my.anivo` | Import Mermaid or Excalidraw |
| `anivo audio add my.anivo voice.mp3` | Add a voiceover |
| `anivo script my.anivo lines.txt` | Set the script (one line for each step) |
| `anivo transcribe my.anivo --model ggml-base.en.bin --align` | Transcribe with whisper.cpp and align |
| `anivo image add my.anivo logo.png` | Add an image |
| `anivo icons add ./my-icons` | Add an icon pack from SVG files |
| `anivo theme import my.anivo brand.json` | Use a custom theme |
| `anivo comp save my.anivo --ids card,title --out card.anivo-comp.json` | Save elements and their animations as a composition (the editor imports the same file) |
| `anivo comp insert other.anivo card.anivo-comp.json --at 200,300 --text title=Latency` | Insert a composition, and set its texts |
| `anivo preset apply my.anivo rise-in --step s-two --targets a,b [--file my.anivo-presets.json]` | Apply a built-in motion preset, or one from your preset file |
| `anivo serve my.anivo` | Open the scene in the web app on this computer |
| `anivo mcp` | The MCP server for agents (see [Agents](04-agents.md)) |

Add `--json` to any command for machine-readable output. Run `anivo <command> --help` for all options.
