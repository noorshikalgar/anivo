import { expect, test } from "@playwright/test";
import { openEditor, screen, state } from "./helpers.js";

test("comment on an element, answer, resolve, and see it in the saved scene", async ({ page }) => {
  await openEditor(page);
  const lb = ((await state(page)) as unknown as { scene: { elements: Record<string, { x: number; y: number; width: number; height: number }> } }).scene.elements["lb"]!;
  const p = await screen(page, lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel("Inspector").getByRole("button", { name: "Comments" }).click();
  const panel = page.getByRole("group", { name: "Comments" });
  await panel.getByRole("textbox", { name: "New comment" }).fill("Make this bigger?");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await panel.getByRole("textbox", { name: "New comment" }).fill("Done.");
  await panel.getByRole("button", { name: "Answer" }).click();
  await expect(panel.getByRole("article")).toHaveCount(2);
  await panel.getByRole("button", { name: "Resolve" }).click();
  const s = (await state(page)) as unknown as { scene: { comments: { text: string; resolved: boolean; replyTo?: string }[] } };
  expect(s.scene.comments).toEqual([expect.objectContaining({ text: "Make this bigger?", resolved: true }), expect.objectContaining({ text: "Done.", replyTo: "cm-1" })]);
});
