# 42 — Natural pace: the voice sets the time

Status: built, 2026-10-28. Owner feedback on the narrated videos: the pauses between lines were too long, and the voice did not set the pace.

## 1. What was hard

| # | Problem |
|---|---|
| P1 | A step held until a viewer could read its caption (docs/31): 0.45 s for each word, minimum 2.5 s. In a narrated video, the voice reads the caption. The extra hold made a silent pause after each line. |
| P2 | Kokoro adds silence at the two ends of each clip: about 0.2 s at the start and 0.8 s at the end. With the old 0.3 s lead and 0.6 s tail, the gap between two lines was about 1.9 s. |
| P3 | `voice.py fit` made a step longer when the line did not fit. It did not make a step shorter. A step that was too long stayed too long. |

## 2. The change

| Rule | Detail |
|---|---|
| Caption pace `voice` | `captionPace: "voice"` (script `captions=voice`). The caption does not make a step longer. The text types at 0.3 s for each word, at about the speed of speech. |
| Clip edges | `voice.py synth` cuts the silence at the two ends of each clip. It keeps 40 ms at each end. |
| Pauses | The voice starts 150 ms after the step starts. 0.6 s between two lines. 1 s before a section: a step with `transition=`. 1 s after the intro and before the outro (`# part: intro` or `# part: outro` after the step line). 2 s on the last frame. |
| Speed | Kokoro speed 0.9. Owner feedback on the plasma membrane video: "make it a little slow, so the viewer can understand". |
| Fit both ways | `voice.py fit` sets `hold=` so that each step is as long as its line plus the pause. It makes a step longer or shorter. |
| Dead pause | If the actions of a step take longer than its line, `fit` cannot make the step shorter. Make the actions shorter. |

## 3. Where to set it

| Level | Script | Editor |
|---|---|---|
| Scene | `scene "…" captions=voice` | Scene → Video → Caption reading → Voice |

Use `captions=voice` only in a video with a voiceover.

> **CAUTION:** Do not use `captions=voice` in a video with no voiceover. The steps do not hold for reading, and a viewer cannot read the captions.

## 4. Built

| # | Item |
|---|---|
| V1 | Done. Schema: `settings.captionPace` accepts `voice`. |
| V2 | Done. Engine: `captionTiming(text, "voice")` gives `{ typeMs: words × 300, readMs: 0 }`. `resolveTimeline` does not extend the hold for the caption. |
| V3 | Done. Script: `captions=voice` on the scene line. |
| V4 | Done. Editor: Caption reading → Voice in the Scene panel. |
| V5 | Done. Skill `anivo-video`: `voice.py` cuts clip edges, uses the new pauses, and fits in two directions. The skill uses `captions=voice` for a narrated video. |
| V6 | Done. Skill `anivo-video`: speed 0.9, longer pauses, 1 s gaps around the intro and the outro, and `fit` ignores idle motion (`float`, `breathe`). |

## 5. Acceptance

1. A scene with `captions=voice`, one step with a 300 ms enter action, a 200 ms hold, and a 12-word caption is 500 ms long.
2. The same scene with `captions=quick` is longer than 3000 ms.
3. `captionTiming("one two three", "voice")` returns `{ typeMs: 900, readMs: 0 }`.
