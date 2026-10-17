import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:5174" },
  webServer: [
    {
      command: "pnpm --filter @anivo/spike dev",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @anivo/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
