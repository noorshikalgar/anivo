# 20 — Tool audit and the next build list

Status: audit and plan, 2026-10-24. Method: for each tool, make a real sample with it (as the "haptic" rebuild of a reference video, `anivo-demo/haptic`), look at frames in the middle and at the end of each animation, and write down what is missing, ugly, or hard. Samples: `anivo-demo/audit/a1.txt` (elements and enter effects), `a2.txt` (actions), editor screenshots.

## 1. Findings

### Text (haptic rebuild)

| # | Finding |
|---|---|
| X1 | One word in a sentence cannot have its own color, highlight, underline, or focus. The rebuild used one text element for each word, placed by hand. |
| X2 | The script cannot set the background color (`background=` sets only the kind). |
| X3 | A text box has about 12 px of inner padding: underlines and highlight boxes need manual offsets. |
| X4 | No custom fonts (for example a pixel or a display font). |
| X5 | Lint warns about low contrast for text that is dimmed on purpose (focus on another word). |

### Elements and actions (audit 1 and 2)

| # | Finding |
|---|---|
| E1 | Shapes look flat and plain by default: thin border, no depth. |
| E2 | Arrows are thin and low contrast at 1080p; arrowheads are small. |
| E3 | Flow particles are 2 to 3 px dots: hard to see. |
| E4 | Code text is small (24 px) and leaves the box mostly empty. |
| E5 | The browser widget address text is 18 px (too small at every size). |
| E6 | Enter effects are basic: no blur-in, no rise (up and fade), no spring overshoot; pop and scale feel mechanical. |
| E7 | Flash fills the shape with a heavy color. |
| E8 | No ready-made UI parts for this style: definition card, meter, slider, toggle, bar chart, cursor click. |

### Editor (audit 3)

| # | Finding |
|---|---|
| U1 | Home does not show what Anivo can do. It is grey and empty for a new user. |
| U2 | Quick actions have no preview: you cannot see what "Pop" or "Rise" looks like before you add it. |
| U3 | The active action draws a heavy orange dashed box on the canvas all the time. |
| U4 | Timeline: block labels are cut ("Enter · dra"); the timeline does not follow the playhead while it plays; no time tag on the playhead; no hover feedback on the ruler. |
| U5 | No way to keep an animation and use it again: a nice entrance or a whole animated part must be made again in each scene. |

## 2. Build list

Order: what makes videos look better and saves the most work first.

| # | Item | Fixes |
|---|---|---|
| B1 | Done. **Word ranges in text**: an action can change a range of words in one text element: color, highlight box, underline, dim the rest (focus). Script `text t … ` + `mark t words=2-3 color=… highlight=… underline`. | X1 |
| B2 | Done. Background color in the script and the Scene panel; text without inner padding when it has no box. | X2, X3 |
| B3 | Done. **Beautiful defaults**: new enter effects rise and blur, spring easings for pop; thicker arrows and larger heads; larger flow particles; code text sized to the box; widget text floors; softer flash. | E1–E7 |
| B4 | Done. **Studio theme** (near-black, one purple accent, soft cards), like the reference channels. | E1 |
| B5 | Done. **Motion presets**: built-in presets (rise, blur in, bounce, underline draw, word focus, count up, meter fill, card slide) with a live preview, applied to the selection in one click. **Save your own** preset from the actions of an element; it goes to your library. | U2, U5 |
| B6 | Done. **Compositions**: save selected elements with their animations (all steps) as a composition; insert it in any scene (new IDs, at the click); export and import as a file. | U5 |
| B7 | Done. **UI parts**: definition card, meter, slider, toggle, bar chart, progress ring, cursor with click ripple, notification. Each with a matching motion preset. | E8 |
| B8 | Done. **Timeline feel**: follow the playhead while playing; time tag on the playhead; hover line and time on the ruler; full block labels with icons; double-click a block to edit it; smooth zoom. | U4 |
| B9 | Done. **Home that shows what Anivo can do**: live animated examples, start cards for common videos, and short tips. | U1 |
| B10 | Done. Calmer target marks on the canvas (only on hover in the Actions list). Lint knows that a dimmed word is on purpose. Custom fonts. | U3, X4, X5 |
