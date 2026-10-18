import { expect, test } from "@playwright/test";
import { openEditor, state } from "./helpers.js";

type S = { scene: { elements: Record<string, { type: string; assetId?: string }> }; selection: string[] };

test("pasting SVG text adds an image, and scripts and external links are removed", async ({ page }) => {
  await openEditor(page);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50" onload="alert(1)"><script>alert(2)</script><rect width="100" height="50" fill="#f00"/><image xlink:href="https://evil.example/x.png"/><foreignObject><p>x</p></foreignObject></svg>';
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, svg);
  await expect.poll(async () => ((await state(page)) as unknown as S).selection.length).toBe(1);
  const s = (await state(page)) as unknown as S;
  const el = s.scene.elements[s.selection[0]!]!;
  expect(el.type).toBe("image");
  const stored = await page.evaluate((id) => new TextDecoder().decode((window as unknown as { __anivo: { getState(): { assets: Map<string, Uint8Array> } } }).__anivo.getState().assets.get(id)!), el.assetId!);
  expect(stored).toContain("<rect");
  for (const bad of ["script", "onload", "evil.example", "foreignObject"]) expect(stored).not.toContain(bad);
});

test("pasting a PNG file adds an image; pasting copied elements still works", async ({ page }) => {
  await openEditor(page);
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(4, 2);
    c.getContext("2d")!.fillRect(0, 0, 4, 2);
    const blob = await c.convertToBlob({ type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => Object.values(((await state(page)) as unknown as S).scene.elements).filter((e) => e.type === "image").length).toBe(1);
  // Internal copy and paste of elements.
  await page.evaluate(() => (window as unknown as { __anivo: { getState(): { setSelection(ids: string[]): void } } }).__anivo.getState().setSelection(["lb"]));
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect.poll(async () => Object.keys(((await state(page)) as unknown as S).scene.elements).filter((id) => id.startsWith("lb")).length).toBe(2);
});
