import { expect, test } from "@playwright/test";

const EDITOR = "http://localhost:5173/";

test.describe("editor shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 860 });
    await page.goto(EDITOR);
    await expect(page.getByRole("navigation", { name: "Steps" })).toBeVisible();
  });

  test("loads the template and lists its steps", async ({ page }) => {
    const steps = page.getByRole("navigation", { name: "Steps" });
    await expect(steps.getByRole("button", { name: /^(Base|Step \d+:)/ })).toHaveCount(5);
    await expect(steps.getByRole("button", { name: /Traffic flows/ })).toBeVisible();
    await expect(page.getByText("0:00.0 / 0:10.3")).toBeVisible();
  });

  test("selecting a step moves the playhead to the step end", async ({ page }) => {
    await page.getByRole("button", { name: /Pods fan out/ }).click();
    await expect(page.getByRole("button", { name: /Pods fan out/ })).toHaveAttribute("aria-current", "true");
    await expect(page.getByText("0:03.9 / 0:10.3")).toBeVisible();
  });

  test("play moves the playhead", async ({ page }) => {
    await page.getByRole("button", { name: /Play/ }).click();
    await page.waitForTimeout(600);
    const text = await page.getByText(/ \/ 0:10\.3/).textContent();
    expect(text?.startsWith("0:00.0")).toBe(false);
  });

  test("the canvas draws the scene", async ({ page }) => {
    const canvas = page.getByLabel("Scene canvas");
    await expect(canvas).toBeVisible();
    const nonEmpty = await canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      const first = [d[0], d[1], d[2]];
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] !== first[0] || d[i + 1] !== first[1] || d[i + 2] !== first[2]) return true;
      return false;
    });
    expect(nonEmpty).toBe(true);
  });
});
