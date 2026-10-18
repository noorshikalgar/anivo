# 08 — Audio and captions

## Why this matters

A tech explainer video has a voiceover. The diagram must change when the voice says the matching words.
In After Effects, the creator moves keyframes by hand to match the voice. Anivo does this with cues.

## Tracks

| Track kind | Count | Use |
|---|---|---|
| `voiceover` | 0 or 1 | Speech. Cues and captions use this track |
| `music` | 0 to n | Background music |
| `sfx` | 0 to n | Sound effects (P2: linked to actions) |

## Procedure: link steps to the voiceover

1. The user imports the voiceover file (MP3, WAV, M4A, or OGG).
2. Anivo decodes the file with the Web Audio API (browser) or FFmpeg (Node).
3. Anivo calculates the waveform peaks (1 peak for each 10 ms). Anivo caches the peaks in the scene file.
4. The user pastes the script. Anivo divides the script into lines. One line is one step, by default.
5. Anivo makes a transcript with word times (see [Speech recognition](#speech-recognition)).
6. Anivo aligns each script line to the transcript (see [Alignment](#alignment)).
7. Anivo sets each step trigger to `cue` with the start time of its line.
8. The user examines the cues on the waveform. The user drags a cue to fix it.

> **NOTE:** The user can skip steps 4 to 7. Then the user puts cues on the waveform by hand. Press `M` during play to put a cue at the playhead.

## Speech recognition

| Delivery form | Engine | Notes |
|---|---|---|
| Web app | Whisper (tiny or base model, 8-bit) in the browser with Transformers.js, in a worker. WASM now; WebGPU later | Downloads the model on first use (approximately 40 to 80 MB) from Hugging Face. Ask the user before the download. The browser caches the model. The ONNX Runtime files come from the Anivo site |
| Any | Import a transcript (JSON word list or whisper.cpp JSON) | No speech recognition in Anivo |
| Desktop app, CLI | `whisper.cpp` as a bundled binary, or the system binary | Faster. Works offline |
| Any | Cloud provider with the user's own key (P2) | Optional |

> **WARNING:** Do not send the voiceover to a cloud service unless the user selects a cloud provider. The default is local processing.

## Alignment

Input: script lines and transcript words with times. Output: a start time for each line.

1. Normalize text: lower case, remove punctuation, expand numbers ("3" → "three").
2. Align the script word sequence to the transcript word sequence with a global sequence alignment (Needleman–Wunsch on words, with a fuzzy word match score).
3. The start of a line is the start time of the first matched word of that line.
4. If a line has fewer than 50% matched words, mark the line `unmatched`. Keep its old cue. Show the line in amber.
5. Make sure the cue times increase. If a cue is earlier than the previous cue, mark it `unmatched`.
6. Speech recognition word times can be late, and word ends often run into the pause. Find the speech onsets in the audio (energy in 20 ms frames; a pause is 150 ms or more). Move each line start to the onset with the longest pause before it, between the previous line start (+300 ms) and the word time (+150 ms, at most 2.5 s before).
7. Measure: `pnpm eval:align` (macOS) speaks 5 scripts with 5 voices, transcribes them in the browser, and compares the cues to the true starts.

## Step duration with cues

- A step with a `cue` trigger starts at the cue time.
- If the actions of a step end before the next cue, the step holds its end state until the next cue.
- If the actions of a step end after the next cue, lint reports `step-overlap`. The editor shows a red bar on the timeline. The user can make the actions faster, or move the cue.
- Option "Fit actions to cue" scales the action durations of a step so that they end before the next cue. Minimum scale: 0.5.

## Captions

1. Each script line becomes one caption.
2. The caption starts at the line cue. It ends at the next line cue, or at the end of the last transcript word of the line, whichever is earlier.
3. If a caption has more than 42 characters on a line, divide it into two lines at a word boundary.
4. If a caption has more than 2 lines, divide it into more captions by transcript word times.
5. Export SRT and WebVTT.
6. Burned-in captions use the theme caption style: font, size, background box, position (bottom or top).

## Audio mix for export

1. Decode all tracks to 48 kHz, stereo, 32-bit float.
2. Apply `gainDb`, trim, and `startMs` for each track.
3. Sum the tracks. Apply a limiter at -1 dBFS so that the sum does not clip.
4. Encode: AAC 192 kbps (MP4) or Opus 128 kbps (WebM).

## Record in the app (P1)

1. The user clicks "Record voiceover".
2. The browser asks for microphone permission.
3. Anivo counts down 3 seconds. Then Anivo records.
4. During the record, Anivo plays the steps. The user presses `M` to put a cue at the current time, or Anivo advances on `click` steps with the right-arrow key, and records the time as a cue.
5. The user stops the record. Anivo saves the audio as a `voiceover` track.

This gives the user a natural flow: speak and click, like a live presentation. The cues come from the clicks.
