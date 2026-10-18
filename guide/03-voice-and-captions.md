# 3. Voice and captions

## Add a voiceover

- **Audio › Add voiceover…** imports an MP3, WAV, M4A, OGG, or FLAC file (30 minutes maximum).
- **Audio › Record voiceover…** records with your microphone. After a 3-second countdown, Anivo shows the base state. Press **M** or **→** to start each step while you speak. Anivo saves the times as cues.
- **Audio › Make voiceover from script…** makes speech from each script line with a speech service (an OpenAI-compatible API, with your key, or a local server). Each step starts when its line starts.
- **Audio › Add music…** adds background music. Set the volume (dB) in the audio lane.

The audio lane is above the playback bar. Drag a clip to move it in time.

## Sync the steps to the voice

1. **Audio › Edit script…**: write one line for each step, in order.
2. **Audio › Align script to voiceover…**: click **Transcribe in this browser**. Anivo downloads a speech model one time (about 40 to 80 MB) and transcribes the voiceover on your computer. The voice does not leave your computer. Or import a transcript (JSON).
3. Each line now starts its step at the spoken words. A line that Anivo did not find shows in amber; set its cue by hand.

You can also set cues by hand: select a step, set **Start** to **At voiceover cue**, or drag the numbered cue markers on the voiceover clip. Press **M** during play to put a cue for the next step at the playhead.

## Captions

The script lines are the captions. In **Export**, select **Burned in** (bottom or top), **SRT file**, or **WebVTT file**. CLI: `anivo captions my.anivo --out my.srt`.
