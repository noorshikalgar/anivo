import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { type: string }>; steps: { title: string }[] } };

async function configure(page: import("@playwright/test").Page, provider: "OpenAI-compatible endpoint" | "Anthropic (Claude)", baseUrl?: string) {
  await page.getByRole("button", { name: "AI", exact: true }).click();
  const panel = page.getByRole("region", { name: "AI panel" });
  // With no key saved, the settings open first.
  await expect(panel.getByRole("button", { name: "Save" })).toBeVisible();
  await panel.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: provider }).click();
  if (baseUrl) await panel.getByRole("textbox", { name: "Base URL" }).fill(baseUrl);
  await panel.getByLabel("API key").fill("test-key");
  await panel.getByRole("button", { name: "Save" }).click();
  return panel;
}

test("OpenAI-compatible: the model calls a tool, the scene changes, and the panel shows the call", async ({ page }) => {
  await openEditor(page);
  const bodies: { messages: { role: string; content?: string }[]; tools: unknown[] }[] = [];
  await page.route("http://mock.ai/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    expect(route.request().headers()["authorization"]).toBe("Bearer test-key");
    const reply =
      bodies.length === 1
        ? { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "script_apply", arguments: JSON.stringify({ script: 'box cache "Cache" at=300,800\nstep "Cache"\n  enter cache pop\n' }) } }] } }] }
        : { choices: [{ message: { content: "I added a cache and a step that shows it." } }] };
    await route.fulfill({ json: reply });
  });
  const panel = await configure(page, "OpenAI-compatible endpoint", "http://mock.ai/v1");
  await panel.getByRole("textbox", { name: "Message" }).fill("Add a cache");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByText("I added a cache and a step that shows it.")).toBeVisible();
  await expect(panel.getByText(/script_apply .* Applied/)).toBeVisible();
  const s = (await state(page)) as unknown as S;
  expect(s.scene.elements["cache"]!.type).toBe("rectangle");
  // The system prompt has the guide and the current scene; the tool result goes back to the model.
  expect(bodies[0]!.messages[0]!.content).toContain("Anivo Script quick reference");
  expect(bodies[0]!.messages[0]!.content).toContain("Load balancer");
  expect(bodies[0]!.tools.length).toBeGreaterThanOrEqual(8);
  expect(bodies[1]!.messages.at(-1)).toMatchObject({ role: "tool", content: expect.stringContaining("Applied") });
  // Undo removes the AI change.
  await page.keyboard.press("Control+z");
  expect(((await state(page)) as unknown as S).scene.elements["cache"]).toBeUndefined();
});

test("Anthropic: streamed tool use with the SDK in the browser", async ({ page }) => {
  await openEditor(page);
  let calls = 0;
  const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  const message = (content: unknown[], stop: string) => [
    ["message_start", { type: "message_start", message: { id: `m${calls}`, type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ...content.flatMap((c, i) => {
      const block = c as { type: string; text?: string; id?: string; name?: string; input?: unknown };
      if (block.type === "text")
        return [
          ["content_block_start", { type: "content_block_start", index: i, content_block: { type: "text", text: "" } }],
          ["content_block_delta", { type: "content_block_delta", index: i, delta: { type: "text_delta", text: block.text } }],
          ["content_block_stop", { type: "content_block_stop", index: i }],
        ];
      return [
        ["content_block_start", { type: "content_block_start", index: i, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }],
        ["content_block_delta", { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } }],
        ["content_block_stop", { type: "content_block_stop", index: i }],
      ];
    }),
    ["message_delta", { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 20 } }],
    ["message_stop", { type: "message_stop" }],
  ] as [string, unknown][];
  let secondBody: { messages: { role: string; content: unknown }[] } | null = null;
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(route.request().headers()["x-api-key"]).toBe("test-key");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tools[0].eager_input_streaming).toBe(true);
    if (calls === 2) secondBody = body;
    const events =
      calls === 1
        ? message([{ type: "text", text: "Let me look." }, { type: "tool_use", id: "tu1", name: "preview", input: { step: 1 } }], "tool_use")
        : message([{ type: "text", text: "The first step shows the user." }], "end_turn");
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(events) });
  });
  const panel = await configure(page, "Anthropic (Claude)");
  await panel.getByRole("textbox", { name: "Message" }).fill("What does step 1 show?");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByText("The first step shows the user.")).toBeVisible();
  await expect(panel.getByText(/preview step=1/)).toBeVisible();
  // The preview image goes back to the model as an image block.
  const result = (secondBody!.messages.at(-1)!.content as { type: string; content: { type: string }[] }[])[0]!;
  expect(result.type).toBe("tool_result");
  expect(result.content.map((c) => c.type)).toEqual(["text", "image"]);
});
