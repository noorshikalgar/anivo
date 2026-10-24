# 27 — Round 8: templates that show what Anivo can do

Status: build, 2026-10-24. The ten built-in templates were the first thing a new user opened, and they looked older than the samples: the plain slate theme, small elements in a large frame, a caption element instead of step captions, and no new motion.

| # | Item |
|---|---|
| T1 | Done. All templates use the Studio theme with a soft gradient. |
| T2 | Done. All ten templates are rewritten in Anivo Script: larger parts, a title that builds word by word, a step caption for each step, chains (`after=prev`), and the new motion (spotlight, circle, rolling count, float, icon particles). |
| T3 | Done. Fix found on the way: a step caption took its anchor from an element that leaves in the step (an exit), so it had no anchor and covered text in the top band. The anchor is now an element that shows at the end of the step, and a caption with no anchor takes the place in the top or bottom band that covers the least. |

The editor tests keep a frozen copy of the first load balancer scene (`packages/schema/fixtures`), so the new templates do not change them.
