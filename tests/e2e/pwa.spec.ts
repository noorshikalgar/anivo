import { expect, test } from "@playwright/test";
import { openHome } from "./helpers.js";

test("the app has a web manifest with icons and a file handler for .anivo", async ({ page }) => {
  await openHome(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const m = (await (await page.request.get(new URL(href!, page.url()).href)).json()) as { name: string; display: string; icons: { src: string; purpose?: string }[]; file_handlers: { accept: Record<string, string[]> }[] };
  expect(m.name).toBe("Anivo");
  expect(m.display).toBe("standalone");
  expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  expect(Object.values(m.file_handlers[0]!.accept).flat()).toContain(".anivo");
  for (const i of m.icons) expect((await page.request.get(new URL(i.src, page.url()).href)).ok()).toBe(true);
});

test("the Install button shows when the browser offers to install the app", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("button", { name: "Install the app" })).toHaveCount(0);
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => undefined;
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  const install = page.getByRole("button", { name: "Install the app" });
  await expect(install).toBeVisible();
  await install.click();
  await expect(install).toHaveCount(0);
});
