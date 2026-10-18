import { expect, test } from "@playwright/test";
import { openEditor } from "./helpers.js";

test("? shows the shortcuts, and the history shows who made each change", async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" }).getByText("Command palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { apply(tx: unknown): unknown } } }).__anivo.getState();
    st.apply({ label: "Agent adds a box", author: { kind: "agent", name: "claude-code" }, ops: [{ op: "element.add", type: "rectangle", props: { x: 0, y: 0, width: 100, height: 50 } }] });
  });
  await page.getByRole("button", { name: "History" }).click();
  const list = page.getByRole("list", { name: "Changes" });
  await expect(list.getByRole("listitem").first()).toContainText("Agent adds a box");
  await expect(list.getByRole("listitem").first()).toContainText("claude-code");
  await expect(list.getByRole("listitem").nth(1)).toContainText("You");
});
