import { expect, test } from "@playwright/test";
import { drag, openEditor, screen, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { x: number; y: number }> } };

test("a moved element snaps to the top edge of another element (smart guide)", async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const st = (window as unknown as { __anivo: { getState(): { apply(tx: unknown): unknown } } }).__anivo.getState();
    st.apply({ ops: [
      { op: "element.add", id: "ga", type: "rectangle", props: { x: 101, y: 101, width: 200, height: 100 } },
      { op: "element.add", id: "gb", type: "rectangle", props: { x: 600, y: 400, width: 200, height: 100 } },
    ] });
  });
  const from = await screen(page, 700, 450);
  // Move gb up by 293 px: the grid alone gives y = 104; the guide gives y = 101 (top of ga).
  const to = await screen(page, 700, 450 - 293);
  await drag(page, from, to);
  const s = (await state(page)) as unknown as S;
  expect(s.scene.elements["gb"]!.y).toBe(101);
});
