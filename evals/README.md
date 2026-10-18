# Agent eval suite

The eval checks that an AI agent can make good videos with the Anivo MCP server, with no human edit (docs/09, FR-AGENT-13).

| File | Content |
|---|---|
| `prompts.json` | 20 fixed prompts with the requested step count |
| `rubric.md` | The 1-to-5 rubric for the model grader |
| `run.ts` | The runner: agent loop (Claude) + MCP server in-process + scores |

## Run

> **CAUTION:** A real run calls the Claude API and costs money. Run one or three prompts first to measure the cost.

```bash
pnpm eval --dry --limit 3      # harness check, no API calls
pnpm eval --limit 3            # three prompts
pnpm eval                      # all 20 prompts
```

Credentials: `ANTHROPIC_API_KEY`, or an `ant auth login` profile. Options: `--model`, `--grader` (default `claude-opus-5-5`), `--only dns,tcp`.

Results go to `evals/results/` (JSON and one contact sheet PNG for each prompt). The weekly GitHub workflow runs only if the repository has an `ANTHROPIC_API_KEY` secret.

## Scores

- **Valid:** the agent saved `video.anivo`, and it opens.
- **Lint errors:** must be 0.
- **Steps:** within 1 of the requested count.
- **Grade:** the model grader score of the contact sheet (1 to 5, `rubric.md`).

Phase 2 gate (docs/13): 8 of 10 prompts valid with no human edit, and a mean grade of 3.5 or more.
