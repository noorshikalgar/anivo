---
name: anivo-video
description: Make a narrated explainer video (2-10 min) with Anivo, from a topic or a script - story, layout, a look, a local voiceover (Kokoro), checks, and an MP4. Use when the user asks for an explainer video, a YouTube video, or a video on a topic with Anivo.
---

# Anivo explainer video

This skill makes a finished MP4 with a voiceover: one idea for each step, a caption that the voice reads, and a look. It builds on `prompts/scene-agent.md` (the Anivo Script reference and the base design rules). Read that file first if you do not know Anivo Script.

## Tools

| Tool | Use |
|---|---|
| `node packages/cli/bin/anivo.js` (`pnpm build:cli` first) | `new`, `apply --mode replace`, `lint`, `summary`, `contact-sheet`, `preview --step N`, `render` |
| `scripts/voice.py synth` | One WAV for each step, with Kokoro. Needs the Kokoro Python (see Setup). |
| `scripts/voice.py fit` | Sets `hold=` in the script so that each step lasts its spoken line. One round. |
| `scripts/voice.py mix` | One voice track; each line starts 0.12 s after its step starts. |
| `scripts/look.py` | A look preset (`classroom`, `black-metal`) and optional font files, into the `.anivo` file. |
| `ffmpeg` | Put the voice track on the silent video. |

## Setup (one time)

```bash
uv venv --python 3.12 ~/.anivo-tts && uv pip install --python ~/.anivo-tts/bin/python kokoro soundfile "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
```

If `synth` stops with "No virtual environment found", the spaCy model `en_core_web_sm` is missing. Install it as above.

The first run downloads the model (about 330 MB) from Hugging Face. Kokoro is Apache 2.0: you can use the voice in videos that earn money. `espeak-ng` (Homebrew) helps with words that are not in the dictionary.

Voices that the owner chose: **`am_puck`** (male, default) and **`af_heart`** (female). Other voices: `am_liam`, `am_echo`, `bm_fable`. Do not use `am_michael` (sounds too old).

## Pace (docs/42)

Use `captions=voice` in the scene line of a narrated video: the voice sets each step's time, not the caption reading time. The pace is calm, about 0.9 of a natural pace, so that a viewer can follow: Kokoro speed 0.95 (`synth` default), 0.45 s between two lines, 0.8 s before a section (a step with `transition=`), 1 s after the intro and before the outro, 2 s on the last frame, 1.5 s of silence at the start (`START_MS`; the first step must start with `wait 1500ms`). `voice.py` cuts the silence at the ends of each Kokoro clip, so these pauses are the only pauses. `fit` sets `hold=` both ways (longer and shorter). A step whose actions take longer than its line makes a dead pause: shorten the actions. Idle motion (`float`, `breathe`) does not count as an action. Do not slow it more: speed 0.9 with 0.6 s pauses felt like a teleprompter.

## Procedure

1. **Story first, in plain words.** Write the narration before the layout. Shape: **intro** (see below) → the simple case → the new idea → how it works (2-4 steps) → what it causes → real examples → a catch or a limit → **outro**. 12-25 steps. Rewrite the user's text: one idea for each step, 15-30 words for each line, short sentences, numbers as words if the voice must say them.
2. **Plan each step as a pair: line + picture.** The picture shows what the line says, at the moment it says it. If a step has no picture change, join it with the next step.
3. **Write a generator** (`gen.py`) that writes the `.txt` script. Loops make rows of bars, ticks, and cells; a generator keeps the IDs and positions consistent. One `caption="..."` for each step = the narration. For a step with no caption (the title), write `# say: ...` on the line after the step line.
4. **Compile and lint.** `new` → `apply --mode replace` → fix all lint errors. Overlap warnings are fine when you mean them (a dot on a line).
5. **Voice.** `synth` → `fit` → `look.py` → `contact-sheet`. Examine the sheet (rules below). Fix in `gen.py`, then run `gen.py`, `new`, `fit`, `look.py` again. `fit` applies the script for you.
6. **Render and mix.**

```bash
anivo render x.anivo --out silent.mp4
python3 scripts/voice.py mix x.anivo voice voice.wav --anivo "node packages/cli/bin/anivo.js"
ffmpeg -y -i silent.mp4 -i voice.wav -c:v copy -c:a aac -b:a 160k -shortest final.mp4
```

7. **Check frames of the MP4**, not only the sheet: at step changes (a flash, a jump) and in the middle of long steps.
8. **Report**: the length, the voice, the look, what you did not fix.

> **CAUTION:** Run `look.py` after `fit` and before `render`. `fit` applies the script in replace mode, which removes the look.

## Intro and outro

Each video has an intro and an outro. Mark each of their steps with a `# part: intro` or `# part: outro` line after the step line. `fit` then puts 1 s of silence between the intro and the body, and between the body and the outro. The picture holds during the silence.

| Part | Steps | Picture | Voice |
|---|---|---|---|
| Intro 1: title | 1 | 1.5 s of empty paper first (`wait 1500ms` is the first action; the watermark is already there), then the title types in (font 110-130), a subtitle fades in, a hand-drawn underline wipes. | `# say:` a hook question, then the topic: "What … ? Let's explore …". |
| Intro 2: map | 1 | Three or four chips (boxes with `look=soft`, font 40-44) enter one by one: the parts of the video. Keep the title on the screen, smaller (`morph` the title y and font size). | "In the next few minutes: …, …, and …". One chip enters when the voice says it. |
| Outro 1: recap | 1 | "In short": a numbered list, one point for each main idea. Each point enters when the voice says it. | The recap, 20-30 words. |
| Outro 2: end card | 1 | The title again, "Thanks for watching" (accent), and the watermark stays. Calm: `fade` and one `rise`. | "Thanks for watching." and one sentence to remember. |

Use `transition=fade` on the first body step and on the first outro step.

## Watermark

Add a small Anivo watermark to each video, at the top right. Put this line last in the elements, so it draws on top. Do not enter or exit it: it shows for the whole video.

```
text wm "made with anivo" at=1600,24 size=296x48 font-size=30 text-align=right color=muted opacity=0.75
```

If a step uses the top-right corner (y < 80, x > 1600), move the watermark to the bottom left: `at=24,1010`. Keep the caption band free of it: a caption is in the bottom center.

## Layout rules (1920 × 1080)

| Zone | y | Use |
|---|---|---|
| Heading | 60-180 | One heading for each section, font 56-64. |
| Stage | 200-820 | The picture. Keep the main shapes here. |
| Caption band | 880-1040 | Keep it empty. The caption goes here as a subtitle. If an element is here, the caption moves next to the picture and covers it. |

- A maximum of about 12 shapes at one time. Clear the stage (`exit … fade dur=400ms`) when a section starts; use `transition=fade` on that step.
- Text sizes: heading 56-64, labels 36-46, small notes 32-38. Mono fonts are wider: about 0.6 × font size for each letter. Measure: `letters × 0.6 × size < width`.
- A box label with two lines: `"64 weights\nscale 0.11"`.
- Bars of a chart: compute the heights so the tallest bar stays below the heading (top ≥ 220).
- Do not use IDs that are verbs or keywords (`scale`, `count`, `move`): the script reads them as words. Arrow IDs and element IDs share one namespace.
- IDs are lower case: `meml`, not `memL`. Action IDs (`id=up1`) share the namespace with element IDs.
- The sketch (hand-drawn) font has no subscript or superscript characters. Write `O2`, `H2O`, `K+`, `Na+`, not `O₂` or `K⁺`.
- A caption of more than about 120 characters wraps to three lines and moves up over the picture. Keep each line to two subtitle lines.
- Moving things (`move path=`) must end clear of other shapes and above the caption band (y < 840).

## Motion rules

- Each new thing enters when the voice talks about it: chain with `after=prev`; keep each action 0.4-1.2 s.
- `wipe direction=up` for bars, `draw-on` for arrows, `pop` for shapes, `typewriter` for a title, `count` for numbers.
- One emphasis (`pulse`, `circle`, `shake`, `glow`) for each step, at the end of its actions.
- Use `morph` for a change of state (a label, a fill, a width), not exit + enter.

## Looks

| Preset | Script line | Feel |
|---|---|---|
| `classroom` | `style=sketch theme=paper-light background=grid` | Exercise book: paper, navy ink, blue and red pen, yellow highlighter, hand-drawn shapes. |
| `classic` | any light script line (the preset sets `style=clean` and a solid background) | Classic textbook: clean white, crisp lines, blue and red ink, a card caption. |
| `black-metal` | `theme=studio-dark background=solid` + `--font` a mono font | Black, bone white, blood red. |

Each preset also sets a caption style (`classroom`: marker, `classic`: card, `black-metal`: subtitle) unless the script sets `caption-style=`.

### Caption styles (docs/41)

| Style | Use |
|---|---|
| `subtitle` | Floating text, no box. A good default for any look. |
| `marker` | Highlighter strokes, hand-drawn font in the sketch style. Classroom and notes. |
| `bar` | A full-width band. Strong contrast; keep the bottom band free. |
| `card` | A card with an accent bar. Tutorials. |
| `slam` | Big words over a dimmed picture. Only for one short line (3 to 8 words): set it on that step (`caption-style=slam`), for a hook or a key result. |
| `none` | Voice only. |

Match the caption to the look. Do not use `slam` for the whole video.

Add a preset to `PRESETS` in `look.py` for a new look. Use theme tokens in the script (`accent`, `success`, …), not hex colors, so a look changes everything.

## Facts and honesty

- Check facts that the user gave. If a claim is weak or out of date, say so to the user and use a safer word ("at least", "about", "rough picture").
- Write "rough numbers" on the screen when a chart is a picture, not data.
