import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openEditor } from "./helpers.js";

/** Critical and serious axe issues (FR-UX-07: zero critical issues). */
async function scan(page: import("@playwright/test").Page, include?: string) {
  // Fluent UI focus sentinels (<i data-tabster-dummy>) are hidden and move focus on at once. They are not a problem for users.
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-tabster-dummy]");
  if (include) b = b.include(include);
  const r = await b.analyze();
  return r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("the editor has no critical or serious accessibility issues", async ({ page }) => {
  expect(await scan(page)).toEqual([]);
});

test("the editor with a selected element and step has no critical or serious issues", async ({ page }) => {
  await page.getByRole("button", { name: /Load balancer/ }).first().click();
  await page.getByRole("button", { name: "Show the timeline" }).click();
  expect(await scan(page)).toEqual([]);
});

for (const [name, open] of [
  ["export", (p: import("@playwright/test").Page) => p.keyboard.press("Control+e")],
  ["command palette", (p: import("@playwright/test").Page) => p.keyboard.press("Control+k")],
  ["theme editor", (p: import("@playwright/test").Page) => p.getByRole("button", { name: "Edit custom theme…" }).click()],
  ["script", async (p: import("@playwright/test").Page) => (await p.getByRole("button", { name: "Audio", exact: true }).click(), await p.getByRole("menuitem", { name: "Edit script…" }).click())],
  ["present mode", (p: import("@playwright/test").Page) => p.getByRole("button", { name: "Present" }).click()],
  ["templates", async (p: import("@playwright/test").Page) => (await p.getByRole("button", { name: "File" }).click(), await p.getByRole("menuitem", { name: "New from template…" }).click())],
] as const) {
  test(`the ${name} dialog has no critical or serious issues`, async ({ page }) => {
    await open(page);
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.waitForTimeout(300);
    expect(await scan(page, "[role=dialog]")).toEqual([]);
  });
}

test("Tab reaches the main controls in reading order", async ({ page }) => {
  await page.locator("body").focus();
  const seen: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40) : "";
    });
    if (name) seen.push(name);
  }
  const at = (n: string | RegExp) => seen.findIndex((s) => (typeof n === "string" ? s === n : n.test(s)));
  for (const n of ["File", "Audio", /^Export/, /User appears/]) expect(at(n), `${n} in ${seen.join(" › ")}`).toBeGreaterThanOrEqual(0);
  expect(at("File")).toBeLessThan(at(/User appears/));
});
