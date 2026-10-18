# Eval rubric (model grader)

The grader sees the contact sheet (the end state of each step, with titles) and the user request.
It gives one score from 1 to 5.

| Score | Meaning |
|---|---|
| 5 | Correct and clear. Each step shows one idea. A viewer understands the topic with no other help. Clean layout: no overlap, readable labels, balanced space. |
| 4 | Correct and clear, with small layout problems (a crowded area, a long label, uneven spacing). |
| 3 | Mostly correct. Some steps are unclear, or the layout makes the diagram hard to follow. |
| 2 | Important parts are missing or wrong, or the layout is hard to read. |
| 1 | Not useful: wrong, empty, or unreadable. |

Rules for the grader:

1. Judge only what the images show.
2. Do not give points for effort.
3. A technical error lowers the score by at least 1.
