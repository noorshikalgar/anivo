# 33 — Feature 2: steps become simple chapters

Status: design and build, 2026-10-25. Owner: "we can even change this step thing completely and make it simple … like Excalidraw, any user can come and start using it with ease."

## 1. What is hard now

| # | Problem |
|---|---|
| P1 | Two cursors: the selected step and the playhead. They can point at different places: the Actions tab edits step 1 while the playhead is in step 3. |
| P2 | Many tools stop with "Select a step first" or "Add a step (N)". A new user does not know what a step is yet. |
| P3 | A new action starts at the step start, not where the user put the playhead. The timeline is not "the place where things happen". |
| P4 | "Base · before step 1" is a special view with its own rules (the canvas shows time −1). |
| P5 | Animate mode and Draw a motion path need a selected step. |

## 2. The model after this change

Steps stay in the data (the script, agents, Present mode, captions, and transitions use them), but in the editor they are **chapters on the timeline**:

| Rule | Detail |
|---|---|
| One cursor | The step that holds the playhead is the selected step. Scrub, click the ruler, or stop playback: the step under the playhead becomes the current one. Click a step in the list: the playhead goes there. |
| No step needed | When a tool needs a step and the scene has none, Anivo adds "Step 1". Messages that said "Select a step first" are gone. |
| Actions start at the playhead | When you put the playhead in a step and add an action, it starts at the playhead. (Right after a click on a step, the playhead is at the step end and actions start at the step start, as before.) |
| Start, not Base | The first row of the list is "Start · 0:00": the elements before anything animates. |
| Keys | Element keys are on the video time (docs/32) and do not need steps. |

## 3. Out of scope here

- Removing steps from the data model (the script, agents, and Present mode depend on them).
- Renaming "step" to "chapter" in the script.

## 4. Built

| # | Item |
|---|---|
| S1 | Done. One cursor: the step under the playhead becomes the current step (scrub, ruler click, end of playback). |
| S2 | Done. `ensureStep`: Add action, quick actions, presets, Send, Draw a motion path, and Animate make "Step 1" in a scene with no steps. No "Select a step first" message. |
| S3 | Done. A new action (and a preset) starts at the playhead when the user put the playhead in the step. |
| S4 | Done. "Base · before step 1" is "Start · 0:00"; the empty Steps list says that steps are chapters and are not needed to start. |
| S5 | Done. The Add action hint shows in every view, with words for the new key model. |
