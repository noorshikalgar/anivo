# 4. Agents

An AI agent uses the same operations as the editor. You can undo each agent change.

## MCP server (files)

Add the server to your agent. For Claude Code:

```bash
claude mcp add anivo -- anivo mcp --root ./videos
```

The agent reads and writes scene files only inside `--root`. It calls `anivo_guide` first, writes the scene in Anivo Script, checks it with `anivo_lint` and `anivo_contact_sheet` (one picture of all steps), and exports with `anivo_export`.

Agents that connect over HTTP: `anivo mcp --http` prints an address and a token. Send `Authorization: Bearer <token>` with each request.

## Live in the editor

The agent can change the scene that you see:

1. Add the server with `anivo mcp --attach --web`.
2. Ask the agent to connect. It tells you a pairing code (the code expires in 5 minutes).
3. In the editor, click **Connect agent** and type the code.
4. The agent's changes show with an outline and an **Agent** tag. With **Review agent changes** on, each change waits: click **Accept** or **Reject**. A rejected change does not go into the undo history.

The connection works only on your computer (127.0.0.1).

## AI panel

Click **AI** in the top bar. Select a provider: Anthropic, an OpenAI-compatible endpoint, or Ollama (on your computer). Type your key. The key stays in this browser; other browser extensions can read it. Ask for a change in plain words.

## Anivo Script

A short text language for scenes. Example:

```text
box lb "Load balancer" fill=accent-soft
column pods right-of=lb gap=240
  box pod-1 "pod-1"
  box pod-2 "pod-2"
arrow lb -> pod-1, pod-2
step "Pods"
  enter pod-* pop stagger=150ms
  flow lb->pod-* round-robin
```

`anivo print my.anivo` shows any scene in this language. The full reference is in [prompts/scene-agent.md](../prompts/scene-agent.md).
